package worker

import (
	"encoding/json"
	"net/url"
)

func Secrets(opts DownloadOptions) []string {
	a := opts.AdvancedSettings
	return []string{a.Password, a.TwoFactor, a.VideoPassword, a.ApPassword, a.ClientCertPassword, a.Proxy, a.GeoVerificationProxy}
}

// RetryOptions excludes credentials and local security-sensitive settings from
// disk. Current session settings can be supplied again by an explicit retry.
func RetryOptions(opts DownloadOptions) (json.RawMessage, bool) {
	opts.AdvancedSettings = AdvancedSettings{}
	opts.Thumbnail = ""
	needsURL := false
	if u, err := url.Parse(opts.URL); err == nil {
		query := u.Query()
		for key := range query {
			switch key {
			case "v", "list", "t", "start", "end", "index":
			default:
				query.Del(key)
				needsURL = true
			}
		}
		u.RawQuery = query.Encode()
		u.Fragment = ""
		opts.URL = u.String()
	}
	data, _ := json.Marshal(opts)
	return data, needsURL
}
