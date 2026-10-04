package config

import "testing"

func TestStrictEnvironmentValidation(t *testing.T) {
	for _, test := range []struct{ key, value string }{{"PORT", "7391abc"}, {"PORT", "0"}, {"MAX_DOWNLOAD_DURATION_MS", "9223372036854775807"}, {"INFO_TIMEOUT_MS", "601000"}, {"ALLOW_PRIVATE_URLS", "maybe"}, {"LOG_LEVEL", "quiet"}} {
		t.Run(test.key+test.value, func(t *testing.T) {
			t.Setenv(test.key, test.value)
			if err := validateEnvironment(); err == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
}
func TestLoopbackAndOriginValidation(t *testing.T) {
	for _, host := range []string{"127.0.0.1", "::1", "localhost"} {
		if err := (&Config{Host: host, Port: 7391}).Validate(); err != nil {
			t.Fatal(err)
		}
	}
	for _, cfg := range []Config{{Host: "0.0.0.0", Port: 7391}, {Host: "127.0.0.1", Port: 7391, FrontendOrigins: []string{"http://localhost:5173/path"}}, {Host: "127.0.0.1", Port: 7391, FrontendOrigins: []string{"*"}}} {
		if cfg.Validate() == nil {
			t.Fatal("unsafe configuration accepted")
		}
	}
}
