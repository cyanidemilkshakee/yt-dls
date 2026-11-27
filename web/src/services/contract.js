import schema from '../../../api/contract.json';

// Validate the schema subset used by our payloads without another runtime dependency.
export function assertContract(name, value) {
  const validate = (definition, data, path) => {
    if (!definition) throw new Error(`Unknown contract definition: ${path}`);
    if (definition.$ref) return validate(schema.$defs[definition.$ref.split('/').pop()], data, path);
    if (definition.anyOf) {
      for (const candidate of definition.anyOf) { try { validate(candidate, data, path); return; } catch {} }
      throw new Error(`${path} does not match an expected response`);
    }
    const types = [].concat(definition.type || []);
    const matches = type => type === 'null' ? data === null : type === 'array' ? Array.isArray(data) : type === 'object' ? data !== null && typeof data === 'object' && !Array.isArray(data) : type === 'integer' ? Number.isInteger(data) : type === 'number' ? typeof data === 'number' && Number.isFinite(data) : typeof data === type;
    if (types.length && !types.some(matches)) throw new Error(`${path} has an invalid type`);
    if (definition.enum && !definition.enum.includes(data)) throw new Error(`${path} has an unsupported value`);
    if ('const' in definition && definition.const !== data) throw new Error(`${path} has an unsupported value`);
    if (typeof data === 'string' && definition.maxLength && data.length > definition.maxLength) throw new Error(`${path} is too long`);
    if (typeof data === 'string' && (definition.minLength && data.length < definition.minLength || definition['x-maxBytes'] && new TextEncoder().encode(data).length > definition['x-maxBytes'])) throw new Error(`${path} has an invalid length`);
    if (typeof data === 'string' && definition.pattern && !new RegExp(definition.pattern).test(data)) throw new Error(`${path} has invalid characters`);
    if (typeof data === 'number' && (definition.minimum !== undefined && data < definition.minimum || definition.maximum !== undefined && data > definition.maximum)) throw new Error(`${path} is out of range`);
    if (Array.isArray(data)) {
      if (definition.minItems && data.length < definition.minItems || definition.maxItems && data.length > definition.maxItems || definition.uniqueItems && new Set(data).size !== data.length) throw new Error(`${path} has invalid items`);
      data.forEach((item, index) => validate(definition.items || {}, item, `${path}[${index}]`));
    } else if (data && typeof data === 'object') {
      for (const required of definition.required || []) if (!Object.hasOwn(data, required)) throw new Error(`${path}.${required} is required`);
      for (const [key, item] of Object.entries(data)) {
        const child = Object.hasOwn(definition.properties || {}, key) ? definition.properties[key] : typeof definition.additionalProperties === 'object' ? definition.additionalProperties : null;
        if (!child && definition.additionalProperties === false) throw new Error(`${path}.${key} is unknown`);
        if (child && item !== undefined) validate(child, item, `${path}.${key}`);
      }
    }
  };
  validate(schema.$defs[name], value, name);
  return value;
}
