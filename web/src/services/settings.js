import contract from '../../../api/contract.json';
export const SECRET_SETTING_NAMES = new Set(['password', 'twofactor', 'video-password', 'ap-password', 'client-certificate-password', 'proxy', 'geo-verification-proxy']);
const PROPERTIES = contract.$defs.AdvancedSettings.properties;
const BOOLEAN_NAMES = Object.keys(PROPERTIES).filter(name => PROPERTIES[name].type === 'boolean');
const STRING_NAMES = Object.keys(PROPERTIES).filter(name => PROPERTIES[name].type === 'string');
const INTEGER_RANGES = Object.fromEntries(Object.entries(PROPERTIES).filter(([, spec]) => [].concat(spec.type).includes('integer')).map(([name, spec]) => [name, [spec.minimum, spec.maximum]]));
export const DEFAULT_SETTINGS = Object.fromEntries([...BOOLEAN_NAMES.map(name => [name, false]), ...STRING_NAMES.map(name => [name, '']), ...Object.keys(INTEGER_RANGES).map(name => [name, ''])]);
const DANGEROUS_NAMES = new Set(['enable-file-urls', 'netrc', 'netrc-location', 'netrc-cmd', 'client-certificate', 'client-certificate-key', 'cookies', 'cookies-from-browser', 'ffmpeg-location', 'exec', 'download-archive']);

export function settingBlockedReason(name, capabilities) {
  if (!capabilities) return '';
  if (DANGEROUS_NAMES.has(name) && !capabilities.dangerous_options) return 'This option is disabled by the server.';
  if (['proxy', 'geo-verification-proxy'].includes(name) && capabilities.network_guard) return 'Custom proxies are disabled while the network guard is active.';
  return '';
}

export function validateSettings(input, { sanitize = false, capabilities } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (sanitize) return {};
    throw new Error('Settings must be an object');
  }
  const output = {};
  for (const [name, value] of Object.entries(input)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, name)) continue;
    let valid = true;
    if (BOOLEAN_NAMES.includes(name)) valid = typeof value === 'boolean';
    else if (name in INTEGER_RANGES) {
      if (value === '' || value == null) continue;
      const number = Number(value), [min, max] = INTEGER_RANGES[name];
      valid = Number.isInteger(number) && number >= min && number <= max && typeof value !== 'boolean';
      if (valid) { output[name] = number; continue; }
    } else {
      const limit = PROPERTIES[name]['x-maxBytes'];
      valid = typeof value === 'string' && !value.includes('\0') && new TextEncoder().encode(value).length <= limit;
    }
    if (!valid) { if (sanitize) continue; throw new Error(`Invalid value for ${name}`); }
    const blocked = settingBlockedReason(name, capabilities);
    if (blocked && value) { if (sanitize) continue; throw new Error(`${name}: ${blocked}`); }
    output[name] = value;
  }
  if (output['force-ipv4'] && output['force-ipv6']) {
    if (sanitize) output['force-ipv6'] = false;
    else throw new Error('Choose either IPv4 or IPv6');
  }
  return output;
}

export function unpackSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  if ('schema' in value) return value.schema === 1 ? validateSettings(value.settings, { sanitize: true }) : {};
  return validateSettings(value, { sanitize: true });
}
