// Package api owns the API's shared schema and option enumerations.
package api

import (
	_ "embed"
	"encoding/json"
)

//go:embed contract.json
var Schema []byte

var definitions struct {
	Enums       map[string][]string `json:"enums"`
	Definitions map[string]struct {
		Properties map[string]struct {
			MaxBytes int `json:"x-maxBytes"`
		} `json:"properties"`
	} `json:"$defs"`
}

func init() {
	if err := json.Unmarshal(Schema, &definitions); err != nil {
		panic(err)
	}
}

func Values(name string) []string {
	values, ok := definitions.Enums[name]
	if !ok {
		panic("unknown API enumeration: " + name)
	}
	return append([]string(nil), values...)
}

func StringLimit(definition, field string) int {
	limit := definitions.Definitions[definition].Properties[field].MaxBytes
	if limit == 0 {
		panic("API string limit missing: " + definition + "." + field)
	}
	return limit
}
