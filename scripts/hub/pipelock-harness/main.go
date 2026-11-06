// Copyright 2026 Josh Waldrep
// SPDX-License-Identifier: Apache-2.0
package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp/syntax"
	"runtime"
	"slices"
	"strings"
	"time"

	"github.com/luckyPipewrench/pipelock/internal/config"
	"github.com/luckyPipewrench/pipelock/internal/mcp/tools"
	"github.com/luckyPipewrench/pipelock/internal/rules"
	"github.com/luckyPipewrench/pipelock/internal/scanner"
)

const version = "3.7.1"

type request struct {
	BundleDir   string              `json:"bundle_dir"`
	Config      string              `json:"config"`
	TrustedKeys []keyInput          `json:"trusted_keys"`
	Expected    map[string][]string `json:"expected"`
	Workload    []work              `json:"workload"`
	Pairs       int                 `json:"pairs"`
	DeadlineNS  int64               `json:"deadline_ns"`
}
type keyInput struct {
	Name      string `json:"name"`
	PublicKey string `json:"public_key"`
}

func trustedKeys(inputs []keyInput) []config.TrustedKey {
	out := make([]config.TrustedKey, 0, len(inputs))
	for _, key := range inputs {
		out = append(out, config.TrustedKey{Name: key.Name, PublicKey: key.PublicKey})
	}
	return out
}

type work struct {
	RuleID   string   `json:"rule_id"`
	Positive []string `json:"positive"`
	Negative []string `json:"negative"`
	Clean    []string `json:"clean"`
	Near     []string `json:"near"`
}
type policy struct {
	Eligible []string `json:"eligible"`
	Loaded   []string `json:"loaded"`
}
type ruleFact struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Regex       string `json:"regex"`
	Severity    string `json:"severity"`
	Confidence  string `json:"confidence"`
	Status      string `json:"status"`
	ScanField   string `json:"scan_field,omitempty"`
}
type reader struct {
	Name          string            `json:"name"`
	Version       string            `json:"version"`
	FormatVersion int               `json:"format_version"`
	DeclaredTier  string            `json:"declared_tier"`
	Fingerprint   string            `json:"signer_fingerprint"`
	TrustTier     string            `json:"trust_tier"`
	Digest        string            `json:"bundle_sha256"`
	Declared      []ruleFact        `json:"declared"`
	Policies      map[string]policy `json:"policies"`
	Core          []ruleFact        `json:"core"`
	OfficialKeys  []string          `json:"official_keys"`
}
type timing struct {
	Samples   []int64 `json:"samples_ns"`
	Maximum   int64   `json:"maximum_ns"`
	Completed bool    `json:"completed"`
	Timeout   bool    `json:"timeout"`
}
type measured struct {
	Baseline timing  `json:"baseline"`
	Target   timing  `json:"target"`
	Ratio    float64 `json:"ratio"`
}
type benchmark struct {
	Rules          map[string]measured `json:"rules"`
	Bundle         measured            `json:"bundle"`
	Deprecated     []string            `json:"deprecated"`
	WorkloadSHA256 string              `json:"workload_sha256"`
}

func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func require(err error) {
	if err != nil {
		panic(err)
	}
}
func sorted(s []string) []string { slices.Sort(s); return s }
func declared(b *rules.Bundle) []ruleFact {
	out := make([]ruleFact, 0, len(b.Rules))
	for _, r := range b.Rules {
		out = append(out, ruleFact{r.ID, r.Type, r.Name, r.Description, r.Pattern.Regex, r.Severity, r.Confidence, r.Status, r.Pattern.ScanField})
	}
	slices.SortFunc(out, func(a, b ruleFact) int { return strings.Compare(a.ID, b.ID) })
	return out
}

// Filter order and ranking: pinned internal/rules/loader.go, not rule counts.
func eligible(b *rules.Bundle, cfg *config.Config) []string {
	rank := map[string]int{"low": 0, "medium": 1, "high": 2}
	out := []string{}
	for _, r := range b.Rules {
		if r.Status == rules.StatusDeprecated || r.Status == rules.StatusExperimental && !cfg.Rules.IncludeExperimental || rank[r.Confidence] < rank[cfg.Rules.MinConfidence] {
			continue
		}
		disabled := false
		for _, d := range cfg.Rules.Disabled {
			match, err := path.Match(d, rules.NamespacedID(b.Name, r.ID))
			if err == nil && match {
				disabled = true
			}
		}
		if !disabled {
			out = append(out, r.ID)
		}
	}
	return sorted(out)
}
func loadedIDs(b *rules.Bundle, result *rules.LoadResult) []string {
	out := []string{}
	canonical := map[string]string{}
	for _, r := range b.Rules {
		canonical[r.Name] = r.ID
	}
	add := func(name string) {
		if b.Name == rules.StandardBundleName {
			id, ok := canonical[name]
			if !ok {
				panic("unknown canonical loaded rule")
			}
			out = append(out, id)
		} else {
			id, ok := strings.CutPrefix(name, b.Name+":")
			if !ok {
				panic("unknown loaded namespace")
			}
			out = append(out, id)
		}
	}
	for _, p := range result.DLP {
		add(p.Name)
	}
	for _, p := range result.Injection {
		add(p.Name)
	}
	for _, p := range result.ToolPoison {
		add(p.RuleID)
	}
	return sorted(out)
}
func load(req request, b *rules.Bundle, root string, full bool, only string, noBundle bool) (*config.Config, *rules.LoadResult) {
	cfg, err := config.LoadForRules(req.Config)
	require(err)
	cfg.Rules.RulesDir = root
	cfg.Rules.TrustedKeys = trustedKeys(req.TrustedKeys)
	cfg.Rules.TrustEmbeddedKeys = true
	if full {
		cfg.Rules.MinConfidence = "low"
		cfg.Rules.IncludeExperimental = true
		cfg.Rules.Disabled = nil
	}
	if only != "" {
		for _, r := range b.Rules {
			if r.ID != only {
				cfg.Rules.Disabled = append(cfg.Rules.Disabled, rules.NamespacedID(b.Name, r.ID))
			}
		}
	}
	if noBundle {
		cfg.Rules.RulesDir = filepath.Join(root, ".empty")
		require(os.MkdirAll(cfg.Rules.RulesDir, 0700))
	}
	result := rules.MergeIntoConfig(cfg, version)
	if len(result.Errors) > 0 {
		panic("production reader rejected bundle")
	}
	expected := eligible(b, cfg)
	if noBundle {
		expected = []string{}
	}
	actual := loadedIDs(b, result)
	if !slices.Equal(expected, actual) {
		panic("eligible/loaded identity mismatch")
	}
	if only != "" && !slices.Equal(actual, []string{only}) {
		panic("isolation identity mismatch")
	}
	return cfg, result
}
func stage(req request) (*rules.Bundle, *rules.VerifyResult, []byte, string) {
	data, err := os.ReadFile(filepath.Join(req.BundleDir, "bundle.yaml"))
	require(err)
	b, err := rules.ParseBundle(data)
	require(err)
	encoded, err := os.ReadFile(filepath.Join(req.BundleDir, "bundle.yaml.sig"))
	require(err)
	sig, err := base64.StdEncoding.Strict().DecodeString(strings.TrimSpace(string(encoded)))
	require(err)
	verified, err := rules.VerifyBundleSignatureBytes(data, sig, rules.DefaultTrustPolicy(trustedKeys(req.TrustedKeys)))
	require(err)
	root, err := os.MkdirTemp("", "hubcheck-")
	require(err)
	dir := filepath.Join(root, b.Name)
	require(os.Mkdir(dir, 0700))
	require(os.WriteFile(filepath.Join(dir, "bundle.yaml"), data, 0600))
	require(os.WriteFile(filepath.Join(dir, "bundle.yaml.sig"), encoded, 0600))
	require(rules.WriteLockFile(filepath.Join(dir, "bundle.lock"), &rules.LockFile{InstalledVersion: b.Version, BundleSHA256: digest(data), SignerFingerprint: verified.SignerFingerprint}))
	return b, verified, data, root
}
func inspect(req request, b *rules.Bundle, v *rules.VerifyResult, data []byte, root string) reader {
	out := reader{Name: b.Name, Version: b.Version, FormatVersion: b.FormatVersion, DeclaredTier: b.Tier, Fingerprint: v.SignerFingerprint, TrustTier: v.Tier, Digest: digest(data), Declared: declared(b), Policies: map[string]policy{}, Core: []ruleFact{}, OfficialKeys: []string{}}
	for _, key := range rules.EmbeddedKeyring() {
		out.OfficialKeys = append(out.OfficialKeys, rules.KeyFingerprint(key))
	}
	for _, name := range []string{"stock", "full"} {
		cfg, result := load(req, b, root, name == "full", "", false)
		p := policy{eligible(b, cfg), loadedIDs(b, result)}
		if expected, ok := req.Expected[name]; ok {
			if !slices.Equal(sorted(expected), p.Loaded) {
				panic("expected loaded identities differ")
			}
		}
		out.Policies[name] = p
	}
	for _, p := range config.CoreDLPPatterns() {
		out.Core = append(out.Core, ruleFact{ID: p.Name, Type: "dlp", Name: p.Name, Regex: p.Regex})
	}
	defaults := config.Defaults()
	for _, p := range defaults.ResponseScanning.Patterns {
		if config.IsCoreResponsePatternName(p.Name) {
			out.Core = append(out.Core, ruleFact{ID: p.Name, Type: "injection", Name: p.Name, Regex: p.Regex})
		}
	}
	return out
}
func add(t *timing, ns int64, deadline int64) {
	t.Samples = append(t.Samples, ns)
	if ns > t.Maximum {
		t.Maximum = ns
	}
	if deadline > 0 && ns > deadline {
		t.Timeout = true
	}
	t.Completed = true
}
func median(values []int64) float64 {
	v := slices.Clone(values)
	slices.Sort(v)
	n := len(v)
	if n == 0 {
		panic("missing timing samples")
	}
	if n%2 == 1 {
		return float64(v[n/2])
	}
	return (float64(v[n/2-1]) + float64(v[n/2])) / 2
}
func measure(req request, b *rules.Bundle, root, only string, workload []work) measured {
	cfg0, res0 := load(req, b, root, true, "", true)
	cfg1, res1 := load(req, b, root, true, only, false)
	s0, err := scanner.New(cfg0)
	require(err)
	defer s0.Close()
	s1, err := scanner.New(cfg1)
	require(err)
	defer s1.Close()
	run := func(sc *scanner.Scanner, res *rules.LoadResult) {
		for _, w := range workload {
			var rule rules.Rule
			for _, r := range b.Rules {
				if r.ID == w.RuleID {
					rule = r
				}
			}
			texts := append(append(append(slices.Clone(w.Positive), w.Negative...), w.Clean...), w.Near...)
			for _, text := range texts {
				switch rule.Type {
				case rules.RuleTypeDLP:
					sc.ScanTextForDLP(context.Background(), text)
				case rules.RuleTypeInjection:
					sc.ScanResponse(context.Background(), text)
				case rules.RuleTypeToolPoison:
					tool := map[string]any{"name": "benchmark-tool", "description": text, "inputSchema": map[string]any{"type": "object"}}
					if rule.Pattern.ScanField == "name" {
						tool["name"] = text
						tool["description"] = "benchmark"
					}
					line, e := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{"tools": []any{tool}}})
					require(e)
					tools.ScanTools(line, sc, &tools.ToolScanConfig{Action: "block", ExtraPoison: rules.ConvertToolPoison(res.ToolPoison)})
				}
			}
		}
	}
	out := measured{Baseline: timing{Samples: []int64{}}, Target: timing{Samples: []int64{}}}
	for range req.Pairs {
		start := time.Now()
		run(s0, res0)
		add(&out.Baseline, time.Since(start).Nanoseconds(), req.DeadlineNS)
		start = time.Now()
		run(s1, res1)
		add(&out.Target, time.Since(start).Nanoseconds(), req.DeadlineNS)
	}
	base := median(out.Baseline.Samples)
	if base <= 0 {
		panic("invalid baseline duration")
	}
	out.Ratio = (median(out.Target.Samples) - base) / base
	return out
}
func bench(req request, b *rules.Bundle, root string) benchmark {
	if req.Pairs <= 0 {
		panic("positive measurement pair count required")
	}
	out := benchmark{Rules: map[string]measured{}, Deprecated: []string{}}
	byID := map[string]work{}
	for _, w := range req.Workload {
		if _, ok := byID[w.RuleID]; ok {
			panic("duplicate workload identity")
		}
		byID[w.RuleID] = w
	}
	active := []work{}
	for _, r := range b.Rules {
		if r.Status == rules.StatusDeprecated {
			out.Deprecated = append(out.Deprecated, r.ID)
			continue
		}
		w, ok := byID[r.ID]
		if !ok || len(w.Positive) == 0 || len(w.Negative) == 0 || len(w.Clean) == 0 || len(w.Near) == 0 {
			panic("missing complete rule workload")
		}
		for _, group := range [][]string{w.Positive, w.Negative, w.Clean, w.Near} {
			for _, s := range group {
				if len(s) == 0 {
					panic("empty workload input")
				}
			}
		}
		active = append(active, w)
	}
	if len(active) != len(byID) {
		panic("unknown or deprecated workload identity")
	}
	slices.SortFunc(active, func(a, b work) int { return strings.Compare(a.RuleID, b.RuleID) })
	effective, err := json.Marshal(active)
	require(err)
	out.WorkloadSHA256 = digest(effective)
	for _, w := range active {
		out.Rules[w.RuleID] = measure(req, b, root, w.RuleID, []work{w})
	}
	out.Bundle = measure(req, b, root, "", active)
	return out
}

// Near-prefix discovery uses the production Go regexp AST. An empty prefix is
// reported explicitly; callers must provide a reviewed versioned workload.
func prefix(regex string) map[string]any {
	tree, err := syntax.Parse(regex, syntax.Perl)
	require(err)
	program, err := syntax.Compile(tree.Simplify())
	require(err)
	p, complete := program.Prefix()
	return map[string]any{"prefix": p, "complete": complete}
}
func main() {
	runtime.GOMAXPROCS(1)
	defer func() {
		if recover() != nil {
			fmt.Fprintln(os.Stderr, "hubcheck: REFUSED")
			os.Exit(1)
		}
	}()
	if len(os.Args) != 2 {
		panic("mode required")
	}
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	var req request
	require(decoder.Decode(&req))
	var extra any
	if !errors.Is(decoder.Decode(&extra), io.EOF) {
		panic("extra request")
	}
	if os.Args[1] == "prefix" {
		require(json.NewEncoder(os.Stdout).Encode(prefix(req.Config)))
		return
	}
	b, v, data, root := stage(req)
	defer os.RemoveAll(root)
	var out any
	switch os.Args[1] {
	case "reader":
		out = inspect(req, b, v, data, root)
	case "bench":
		out = bench(req, b, root)
	default:
		panic("unknown mode")
	}
	require(json.NewEncoder(os.Stdout).Encode(out))
}
