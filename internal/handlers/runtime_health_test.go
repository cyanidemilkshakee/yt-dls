package handlers

import "testing"

func TestRuntimeCompatibilityRejectsUnsupportedVersions(t *testing.T) {
	for _, test := range []struct {
		name, version string
		supported     bool
	}{
		{"node", "v20.19.0", false}, {"node", "v22.0.0", true},
		{"deno", "deno 2.2.9", false}, {"deno", "deno 2.3.0", true},
		{"bun", "1.2.10", false}, {"bun", "1.2.11", true}, {"bun", "1.3.14", true}, {"bun", "1.3.15", false},
		{"quickjs", "QuickJS version 2023-12-8", false}, {"quickjs", "QuickJS version 2023-12-9", true},
		{"quickjs", "QuickJS-ng version 0.12.0", true}, {"node", "unknown", false},
	} {
		t.Run(test.name+"/"+test.version, func(t *testing.T) {
			if actual := runtimeCompatibility(test.name, test.version) == ""; actual != test.supported {
				t.Fatalf("supported=%v, want %v", actual, test.supported)
			}
		})
	}
}
