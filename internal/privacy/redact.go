// Package privacy removes credentials and URL query strings from diagnostics.
package privacy

import (
	"net/url"
	"regexp"
	"strings"
)

var urls = regexp.MustCompile(`https?://[^\s<>"']+`)

func URL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return "[redacted URL]"
	}
	u.User = nil
	if u.RawQuery != "" {
		u.RawQuery = "redacted"
	}
	u.Fragment = ""
	return u.String()
}

func Text(raw string, secrets ...string) string {
	for _, secret := range secrets {
		if secret != "" {
			raw = strings.ReplaceAll(raw, secret, "[redacted]")
		}
	}
	return urls.ReplaceAllStringFunc(raw, URL)
}
