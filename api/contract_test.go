package api_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/api"
	"github.com/cyanidemilkshakee/yt-dls/internal/store"
	"github.com/cyanidemilkshakee/yt-dls/internal/worker"
)

type contractDefinition struct {
	Type                 json.RawMessage               `json:"type"`
	Ref                  string                        `json:"$ref"`
	Properties           map[string]contractDefinition `json:"properties"`
	AdditionalProperties json.RawMessage               `json:"additionalProperties"`
	Items                *contractDefinition           `json:"items"`
	Format               string                        `json:"format"`
}

func contractDefinitions(t *testing.T) map[string]contractDefinition {
	t.Helper()
	var schema struct {
		Definitions map[string]contractDefinition `json:"$defs"`
	}
	if err := json.Unmarshal(api.Schema, &schema); err != nil {
		t.Fatal(err)
	}
	return schema.Definitions
}

func TestStructContracts(t *testing.T) {
	definitions := contractDefinitions(t)
	for name, value := range map[string]any{"DownloadOptions": worker.DownloadOptions{}, "AdvancedSettings": worker.AdvancedSettings{}, "ProgressSnapshot": store.ProgressSnapshot{}, "StreamProgress": store.StreamProgress{}, "ResultFile": store.ResultFile{}, "BatchProgress": store.BatchProgress{}} {
		t.Run(name, func(t *testing.T) {
			definition, ok := definitions[name]
			if !ok {
				t.Fatalf("missing definition %s", name)
			}
			properties := definition.Properties
			if string(definition.AdditionalProperties) != "false" {
				t.Errorf("%s does not reject unknown properties", name)
			}
			seen := make(map[string]bool)
			typ := reflect.TypeOf(value)
			for i := 0; i < typ.NumField(); i++ {
				field := typ.Field(i)
				key := strings.Split(field.Tag.Get("json"), ",")[0]
				if key == "" || key == "-" {
					continue
				}
				if property, ok := properties[key]; !ok {
					t.Errorf("field %s is absent from schema", key)
				} else {
					assertContractType(t, definitions, property, field.Type, !strings.Contains(field.Tag.Get("json"), ",omitempty"), name+"."+key)
				}
				seen[key] = true
			}
			for key := range properties {
				if !seen[key] {
					t.Errorf("schema field %s is absent from Go type", key)
				}
			}
		})
	}
}

func assertContractType(t *testing.T, definitions map[string]contractDefinition, definition contractDefinition, typ reflect.Type, requireNullable bool, path string) {
	t.Helper()
	if definition.Ref != "" {
		name := strings.TrimPrefix(definition.Ref, "#/$defs/")
		resolved, ok := definitions[name]
		if !ok || name == definition.Ref {
			t.Errorf("%s has unresolved schema reference %q", path, definition.Ref)
			return
		}
		definition = resolved
	}
	var types []string
	if err := json.Unmarshal(definition.Type, &types); err != nil {
		var single string
		if err := json.Unmarshal(definition.Type, &single); err != nil {
			t.Errorf("%s has no supported schema type", path)
			return
		}
		types = []string{single}
	}
	hasType := func(wanted string) bool {
		for _, value := range types {
			if value == wanted {
				return true
			}
		}
		return false
	}
	if typ.Kind() == reflect.Pointer {
		if requireNullable && !hasType("null") {
			t.Errorf("%s omits JSON null for its nullable Go field", path)
		}
		typ = typ.Elem()
	}
	if typ == reflect.TypeOf(time.Time{}) {
		if !hasType("string") || definition.Format != "date-time" {
			t.Errorf("%s does not declare a date-time string", path)
		}
		return
	}
	var wanted string
	switch typ.Kind() {
	case reflect.String:
		wanted = "string"
	case reflect.Bool:
		wanted = "boolean"
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64, reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		wanted = "integer"
	case reflect.Float32, reflect.Float64:
		wanted = "number"
	case reflect.Struct:
		wanted = "object"
	case reflect.Slice, reflect.Array:
		wanted = "array"
		if definition.Items == nil {
			t.Errorf("%s does not constrain array items", path)
		} else {
			assertContractType(t, definitions, *definition.Items, typ.Elem(), false, path+"[]")
		}
	case reflect.Map:
		wanted = "object"
		var additional contractDefinition
		if json.Unmarshal(definition.AdditionalProperties, &additional) != nil {
			t.Errorf("%s does not constrain dictionary values", path)
		} else {
			assertContractType(t, definitions, additional, typ.Elem(), false, path+".*")
		}
	default:
		t.Errorf("%s has unsupported Go kind %s", path, typ.Kind())
		return
	}
	if !hasType(wanted) {
		t.Errorf("%s has schema types %v, want %s for %s", path, types, wanted, typ)
	}
}

func TestContractReferencesAndEnumerations(t *testing.T) {
	var schema map[string]any
	if err := json.Unmarshal(api.Schema, &schema); err != nil {
		t.Fatal(err)
	}
	definitions := contractDefinitions(t)
	var check func(any)
	check = func(value any) {
		switch node := value.(type) {
		case map[string]any:
			if ref, ok := node["$ref"].(string); ok {
				if !strings.HasPrefix(ref, "#/$defs/") {
					t.Errorf("unsupported reference %q", ref)
				} else if _, ok := definitions[strings.TrimPrefix(ref, "#/$defs/")]; !ok {
					t.Errorf("unresolved reference %q", ref)
				}
			}
			for _, child := range node {
				check(child)
			}
		case []any:
			for _, child := range node {
				check(child)
			}
		}
	}
	check(schema)
	for name := range schema["enums"].(map[string]any) {
		values := api.Values(name)
		seen := map[string]bool{}
		for _, value := range values {
			if value == "" || seen[value] {
				t.Errorf("%s has an empty or duplicate value %q", name, value)
			}
			seen[value] = true
		}
		if len(values) == 0 {
			t.Errorf("%s is empty", name)
			continue
		}
		values[0] = "mutated"
		if api.Values(name)[0] == "mutated" {
			t.Errorf("%s exposes mutable shared values", name)
		}
	}
	statuses := api.Values("downloadStatuses")
	for _, terminal := range api.Values("terminalStatuses") {
		found := false
		for _, status := range statuses {
			found = found || status == terminal
		}
		if !found {
			t.Errorf("terminal status %s is absent from download statuses", terminal)
		}
	}
}
