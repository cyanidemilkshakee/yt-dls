package privacy

import (
	"strings"
	"testing"
)

func TestRedactsCredentialsAndSignedQueries(t *testing.T) {
	output := Text("password https://user:pass@example.com/media?token=secret#fragment", "password")
	for _, secret := range []string{"password", "user:pass", "secret", "fragment"} {
		if strings.Contains(output, secret) {
			t.Fatalf("leaked %s: %s", secret, output)
		}
	}
}
