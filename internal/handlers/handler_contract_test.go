package handlers

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/cyanidemilkshakee/yt-dls/api"
)

// Actual handler payloads must agree with the canonical contract too. Several
// responses are maps assembled at runtime, so Go struct reflection cannot
// catch renamed fields, wrong nullability, or missing required properties.
type responseContract struct {
	Type                 any                         `json:"type"`
	Ref                  string                      `json:"$ref"`
	Properties           map[string]responseContract `json:"properties"`
	Required             []string                    `json:"required"`
	AdditionalProperties json.RawMessage             `json:"additionalProperties"`
	Items                *responseContract           `json:"items"`
	AnyOf                []responseContract          `json:"anyOf"`
	Enum                 []any                       `json:"enum"`
	Format               string                      `json:"format"`
}

func checkResponseContract(definitions map[string]responseContract, definition responseContract, value any, path string) error {
	if definition.Ref != "" {
		name := strings.TrimPrefix(definition.Ref, "#/$defs/")
		var ok bool
		definition, ok = definitions[name]
		if !ok {
			return fmt.Errorf("%s references undefined %s", path, name)
		}
	}
	if len(definition.AnyOf) > 0 {
		for _, option := range definition.AnyOf {
			if checkResponseContract(definitions, option, value, path) == nil {
				return nil
			}
		}
		return fmt.Errorf("%s does not match any allowed response type", path)
	}
	actual := "null"
	switch typed := value.(type) {
	case string:
		actual = "string"
		if definition.Format == "date-time" {
			if _, err := time.Parse(time.RFC3339Nano, typed); err != nil {
				return fmt.Errorf("%s is not a date-time: %w", path, err)
			}
		}
	case bool:
		actual = "boolean"
	case float64:
		actual = "number"
	case []any:
		actual = "array"
	case map[string]any:
		actual = "object"
	}
	types := []any{definition.Type}
	if multiple, ok := definition.Type.([]any); ok {
		types = multiple
	}
	matched := false
	for _, allowed := range types {
		matched = matched || allowed == actual
		if allowed == "integer" {
			if number, ok := value.(float64); ok && math.Trunc(number) == number {
				matched = true
			}
		}
	}
	if !matched {
		return fmt.Errorf("%s is %s, expected %v", path, actual, types)
	}
	if len(definition.Enum) > 0 {
		matched = false
		for _, allowed := range definition.Enum {
			matched = matched || reflect.DeepEqual(value, allowed)
		}
		if !matched {
			return fmt.Errorf("%s contains an unrecognized enum value %v", path, value)
		}
	}
	switch typed := value.(type) {
	case map[string]any:
		for _, name := range definition.Required {
			if _, ok := typed[name]; !ok {
				return fmt.Errorf("%s is missing required property %s", path, name)
			}
		}
		for name, child := range typed {
			property, known := definition.Properties[name]
			if !known {
				if string(definition.AdditionalProperties) == "false" {
					return fmt.Errorf("%s has unknown property %s", path, name)
				}
				if len(definition.AdditionalProperties) == 0 || string(definition.AdditionalProperties) == "true" {
					continue
				}
				if err := json.Unmarshal(definition.AdditionalProperties, &property); err != nil {
					return err
				}
			}
			if err := checkResponseContract(definitions, property, child, path+"."+name); err != nil {
				return err
			}
		}
	case []any:
		if definition.Items == nil {
			return fmt.Errorf("%s has no item schema", path)
		}
		for index, child := range typed {
			if err := checkResponseContract(definitions, *definition.Items, child, fmt.Sprintf("%s[%d]", path, index)); err != nil {
				return err
			}
		}
	}
	return nil
}

func TestHandlerResponsesMatchCanonicalContract(t *testing.T) {
	var schema struct {
		Definitions map[string]responseContract `json:"$defs"`
	}
	if err := json.Unmarshal(api.Schema, &schema); err != nil {
		t.Fatal(err)
	}
	assertResponse := func(name string, payload []byte) {
		t.Helper()
		var value any
		if err := json.Unmarshal(payload, &value); err != nil {
			t.Fatal(err)
		}
		definition, ok := schema.Definitions[name]
		if !ok {
			t.Fatalf("undefined response contract %s", name)
		}
		if err := checkResponseContract(schema.Definitions, definition, value, name); err != nil {
			t.Fatalf("%v\npayload: %s", err, payload)
		}
	}
	app, router := testApp(t, true)
	info := request(router, http.MethodPost, "/api/info", map[string]string{"url": "https://example.com/video"}, nil)
	if info.Code != http.StatusOK {
		t.Fatalf("metadata failed: %d %s", info.Code, info.Body)
	}
	assertResponse("VideoInfo", info.Body.Bytes())
	preview := request(router, http.MethodPost, "/api/download/command-preview", options("https://example.com/video"), nil)
	if preview.Code != http.StatusOK {
		t.Fatalf("command preview failed: %d %s", preview.Code, preview.Body)
	}
	assertResponse("CommandPreview", preview.Body.Bytes())
	admission := request(router, http.MethodPost, "/api/download", options("https://example.com/video"), nil)
	id := acceptedID(t, admission)
	assertResponse("Admission", admission.Body.Bytes())
	waitFor(t, app.Store, id, "completed")
	for _, test := range []struct{ path, name string }{
		{"/api/download/" + id + "/status", "ProgressSnapshot"},
		{"/api/downloads", "History"},
		{"/api/downloads/status/batch?ids=" + id + ",missing", "StatusMap"},
		{"/api/download/" + id + "/log", "Log"},
		{"/api/download/" + id + "/files", "RetainedPreview"},
	} {
		response := request(router, http.MethodGet, test.path, nil, nil)
		if response.Code != http.StatusOK {
			t.Fatalf("%s: %d %s", test.path, response.Code, response.Body)
		}
		assertResponse(test.name, response.Body.Bytes())
	}
	health := request(router, http.MethodGet, "/api/health", nil, nil)
	if health.Code != http.StatusOK && health.Code != http.StatusServiceUnavailable {
		t.Fatalf("health: %d %s", health.Code, health.Body)
	}
	assertResponse("Health", health.Body.Bytes())
	missing := request(router, http.MethodGet, "/api/download/missing/status", nil, nil)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing job: %d %s", missing.Code, missing.Body)
	}
	assertResponse("Error", missing.Body.Bytes())
}

func TestMetadataRejectsURLBeyondContractLimit(t *testing.T) {
	_, router := testApp(t, false)
	limit := api.StringLimit("InfoRequest", "url")
	source := "https://example.com/" + strings.Repeat("x", limit)
	response := request(router, http.MethodPost, "/api/info", map[string]string{"url": source}, nil)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), fmt.Sprintf("%d bytes", limit)) {
		t.Fatalf("oversized metadata URL reached extractor: %d %s", response.Code, response.Body)
	}
}
