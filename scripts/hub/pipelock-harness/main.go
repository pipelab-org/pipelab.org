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
	"regexp"
	"runtime"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/luckyPipewrench/pipelock/internal/config"
	"github.com/luckyPipewrench/pipelock/internal/mcp/tools"
	"github.com/luckyPipewrench/pipelock/internal/rules"
	"github.com/luckyPipewrench/pipelock/internal/scanner"
)

const version = "3.7.1"

// Pinned internal/mcp/tools/tools.go:maxToolDefinitionTextBytes. The builder
// checks this against that exact source declaration before compiling.
const toolDefinitionTextBytes = 1048576

type request struct {
	BundleDir   string              `json:"bundle_dir"`
	Config      string              `json:"config"`
	TrustedKeys []keyInput          `json:"trusted_keys"`
	Expected    map[string][]string `json:"expected"`
	Workload    []work              `json:"workload"`
	Pairs       int                 `json:"pairs"`
	DeadlineNS  int64               `json:"deadline_ns"`
	RuleID      string              `json:"rule_id,omitempty"`
	Positive    []fixtureInput      `json:"positive,omitempty"`
	CapBytes    int                 `json:"cap_bytes,omitempty"`
}
type fixtureInput struct {
	Origin string `json:"origin"`
	Text   string `json:"text"`
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
	ConfigSHA256  string            `json:"config_sha256"`
	WorkloadCaps  map[string]int    `json:"workload_caps"`
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
	BundleSHA256   string              `json:"bundle_sha256"`
	ConfigSHA256   string              `json:"config_sha256"`
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
	configBytes, err := os.ReadFile(req.Config)
	require(err)
	root, err := os.MkdirTemp("", "hubcheck-")
	require(err)
	staged := false
	defer func() {
		if !staged {
			os.RemoveAll(root)
		}
	}()
	require(os.WriteFile(filepath.Join(root, ".base.yaml"), configBytes, 0600))
	dir := filepath.Join(root, b.Name)
	require(os.Mkdir(dir, 0700))
	require(os.WriteFile(filepath.Join(dir, "bundle.yaml"), data, 0600))
	require(os.WriteFile(filepath.Join(dir, "bundle.yaml.sig"), encoded, 0600))
	require(rules.WriteLockFile(filepath.Join(dir, "bundle.lock"), &rules.LockFile{InstalledVersion: b.Version, BundleSHA256: digest(data), SignerFingerprint: verified.SignerFingerprint}))
	staged = true
	return b, verified, data, root
}
func workloadCaps(cfg *config.Config) map[string]int {
	response := cfg.FetchProxy.MaxResponseMB * 1024 * 1024
	return map[string]int{"dlp": cfg.RequestBodyScanning.MaxBodyBytes, "injection": response, "tool-poison": response}
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
		out.WorkloadCaps = workloadCaps(cfg)
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
	configBytes, err := os.ReadFile(req.Config)
	require(err)
	out.ConfigSHA256 = digest(configBytes)
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
func toolInput(rule rules.Rule, text string) []byte {
	tool := map[string]any{"name": "benchmark-tool", "description": text, "inputSchema": map[string]any{"type": "object"}}
	if rule.Pattern.ScanField == "name" {
		tool["name"] = text
		tool["description"] = "benchmark"
	}
	line, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{"tools": []any{tool}}})
	require(err)
	return line
}
func checkedResponse(sc *scanner.Scanner, text string) scanner.ResponseScanResult {
	result := sc.ScanResponse(context.Background(), text)
	if result.ScanError != "" {
		panic("production scan incomplete")
	}
	return result
}
func checkedTools(sc *scanner.Scanner, loaded *rules.LoadResult, rule rules.Rule, text string) tools.ToolScanResult {
	result := tools.ScanTools(toolInput(rule, text), sc, &tools.ToolScanConfig{Action: "block", ExtraPoison: rules.ConvertToolPoison(loaded.ToolPoison)})
	if !result.IsToolsList || result.ResourceLimit != "" {
		panic("production tool scan incomplete")
	}
	return result
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
					checkedResponse(sc, text)
				case rules.RuleTypeToolPoison:
					checkedTools(sc, res, rule, text)
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

// This is a finite, versioned workload, not a worst-case regex construction.
// The producer fixture supplies the first raw (?i) match. Truncate that span
// until it stops matching, repeat with spaces, then check the production path.
func fixtureNear(req request, b *rules.Bundle, root string) map[string]any {
	held := func(reason string) map[string]any { return map[string]any{"status": "held", "reason": reason} }
	var rule rules.Rule
	for _, r := range b.Rules {
		if r.ID == req.RuleID && r.Status != rules.StatusDeprecated {
			rule = r
		}
	}
	if rule.ID == "" {
		return held("unknown or deprecated rule")
	}
	cfg, loaded := load(req, b, root, true, rule.ID, false)
	// Use the effective measurement configuration; Node also applies the
	// source-backed workload ceiling and records both limits.
	ceiling := workloadCaps(cfg)[string(rule.Type)]
	capBytes := req.CapBytes
	if capBytes == 0 {
		capBytes = ceiling
	}
	if capBytes <= 0 || capBytes > ceiling {
		return held("cap is outside the pinned preset")
	}
	re, err := regexp.Compile("(?i)" + rule.Pattern.Regex)
	if err != nil || re.MatchString("") {
		return held("invalid or empty-matching pattern")
	}
	var input fixtureInput
	var span []int
	for _, candidate := range req.Positive {
		if candidate.Origin == "" || !utf8.ValidString(candidate.Text) {
			return held("invalid producer input")
		}
		if found := re.FindStringIndex(candidate.Text); found != nil {
			input, span = candidate, found
			break
		}
	}
	if span == nil {
		return held("no producer line matches the raw pattern")
	}
	seed := input.Text[span[0]:span[1]]
	trimmed := 0
	for seed != "" && re.MatchString(seed) {
		_, size := utf8.DecodeLastRuneInString(seed)
		seed = seed[:len(seed)-size]
		trimmed++
	}
	if seed == "" {
		return held("truncation leaves an empty seed")
	}
	if re.MatchString(seed + " " + seed + " ") {
		return held("seed repetition creates a match")
	}
	text, transportBytes := repeatNear(rule, seed, capBytes)
	if text == "" || re.MatchString(text) {
		return held("capped repetition is empty or matches the raw pattern")
	}
	sc, err := scanner.New(cfg)
	require(err)
	defer sc.Close()
	matched := targetMatches(sc, loaded, rule, text)
	return map[string]any{
		"status": "generated", "generator": "site:fixture-span-truncation-v1",
		"rule_id": rule.ID, "fixture_origin": input.Origin, "fixture_sha256": digest([]byte(input.Text)),
		"span_start": span[0], "span_end": span[1], "seed": seed, "trimmed_runes": trimmed,
		"cap_bytes": capBytes, "preset_cap_bytes": ceiling, "text_bytes": len(text),
		"transport_bytes": transportBytes, "text_sha256": digest([]byte(text)),
		"raw_negative": true, "production_target_match": matched,
		"tool_definition_cap_bytes":  toolDefinitionTextBytes,
		"tool_definition_text_bytes": toolTextBytes(rule, text),
	}
}

func toolTextBytes(rule rules.Rule, text string) int {
	if rule.Type != rules.RuleTypeToolPoison {
		return 0
	}
	// Native budget counts name, description and raw InputSchema JSON bytes.
	fixed := len("benchmark-tool")
	if rule.Pattern.ScanField == "name" {
		fixed = len("benchmark")
	}
	return len(text) + fixed + len(`{"type":"object"}`)
}

// json.Marshal's escaping is additive per rune. Counting that encoded cost
// keeps the complete tools/list envelope inside the cap, including for names,
// quotes, HTML-sensitive characters and multibyte fixture text.
func repeatNear(rule rules.Rule, seed string, capBytes int) (string, int) {
	unit, remaining := seed+" ", capBytes
	textRemaining := capBytes
	cost := func(text string) int { return len(text) }
	if rule.Type == rules.RuleTypeToolPoison {
		remaining -= len(toolInput(rule, ""))
		textRemaining = toolDefinitionTextBytes - toolTextBytes(rule, "")
		cost = func(text string) int { encoded, err := json.Marshal(text); require(err); return len(encoded) - 2 }
	}
	if remaining <= 0 {
		return "", 0
	}
	copies := min(remaining/cost(unit), textRemaining/len(unit))
	remaining -= copies * cost(unit)
	textRemaining -= copies * len(unit)
	var tail strings.Builder
	for _, runeValue := range unit {
		runeText := string(runeValue)
		if cost(runeText) > remaining || len(runeText) > textRemaining {
			break
		}
		tail.WriteRune(runeValue)
		remaining -= cost(runeText)
		textRemaining -= len(runeText)
	}
	text := strings.Repeat(unit, copies) + tail.String()
	transportBytes := len(text)
	if rule.Type == rules.RuleTypeToolPoison {
		transportBytes = len(toolInput(rule, text))
	}
	return text, transportBytes
}

func targetMatches(sc *scanner.Scanner, loaded *rules.LoadResult, rule rules.Rule, text string) bool {
	switch rule.Type {
	case rules.RuleTypeDLP:
		result := sc.ScanTextForDLP(context.Background(), text)
		for _, match := range append(result.Matches, result.InformationalMatches...) {
			for _, pattern := range loaded.DLP {
				if match.PatternName == pattern.Name {
					return true
				}
			}
		}
	case rules.RuleTypeInjection:
		result := checkedResponse(sc, text)
		for _, match := range result.Matches {
			for _, pattern := range loaded.Injection {
				if match.PatternName == pattern.Name {
					return true
				}
			}
		}
	case rules.RuleTypeToolPoison:
		result := checkedTools(sc, loaded, rule, text)
		for _, match := range result.Matches {
			for _, pattern := range loaded.ToolPoison {
				if slices.Contains(match.ToolPoison, pattern.Name) {
					return true
				}
			}
		}
	default:
		panic("unsupported rule type")
	}
	return false
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
	b, v, data, root := stage(req)
	defer os.RemoveAll(root)
	req.Config = filepath.Join(root, ".base.yaml")
	var out any
	switch os.Args[1] {
	case "reader":
		out = inspect(req, b, v, data, root)
	case "bench":
		result := bench(req, b, root)
		result.BundleSHA256 = digest(data)
		configBytes, err := os.ReadFile(req.Config)
		require(err)
		result.ConfigSHA256 = digest(configBytes)
		out = result
	case "near":
		out = fixtureNear(req, b, root)
	default:
		panic("unknown mode")
	}
	require(json.NewEncoder(os.Stdout).Encode(out))
}
