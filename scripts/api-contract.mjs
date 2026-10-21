import { readFile, writeFile } from 'node:fs/promises';

const schema = JSON.parse(await readFile(new URL('../api/contract.json', import.meta.url), 'utf8'));
const type = definition => {
  if (definition.$ref) return definition.$ref.split('/').pop();
  if (definition.anyOf) return definition.anyOf.map(type).join(' | ');
  if ('const' in definition) return JSON.stringify(definition.const);
  if (definition.enum) return definition.enum.map(value => JSON.stringify(value)).join(' | ');
  if (Array.isArray(definition.type)) return definition.type.map(value => type({ ...definition, type: value })).join(' | ');
  if (definition.type === 'array') return `Array<${type(definition.items || {})}>`;
  if (definition.type === 'object' && definition.additionalProperties) return `Record<string, ${type(definition.additionalProperties)}>`;
  if (definition.type === 'object') return `{ ${Object.entries(definition.properties || {}).map(([key, value]) => `${JSON.stringify(key)}${definition.required?.includes(key) ? '' : '?'}: ${type(value)}`).join('; ')} }`;
  return { integer: 'number', number: 'number', string: 'string', boolean: 'boolean', null: 'null' }[definition.type] || 'unknown';
};
const source = '// Generated from api/contract.json by npm run api:generate. Do not edit.\n' + Object.entries(schema.$defs).map(([name, definition]) => definition.properties ? `export interface ${name} {\n${Object.entries(definition.properties).map(([key, value]) => `  ${JSON.stringify(key)}${definition.required?.includes(key) ? '' : '?'}: ${type(value)};`).join('\n')}\n}` : `export type ${name} = ${type(definition)};`).join('\n\n') + '\n';
const target = new URL('../web/src/services/api-types.d.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== source) throw new Error('API types are stale. Run npm run api:generate.');
} else await writeFile(target, source);
