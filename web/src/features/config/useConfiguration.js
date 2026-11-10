import { useReducer } from 'react';
import { configurationReducer, createConfiguration } from './model';

export function useConfiguration(info, initialPreset = 'default', initialConfiguration) {
  const [configuration, dispatch] = useReducer(configurationReducer, info, value => {
    const state = createConfiguration(value);
    const preset = configurationReducer(state, { type: 'preset', name: initialPreset, info: value });
    return initialConfiguration ? configurationReducer(preset, { type: 'restore', value: initialConfiguration, info: value }) : preset;
  });
  const setField = (key, value) => dispatch({ type: 'set', key, value, info });
  const setters = Object.fromEntries(Object.keys(configuration).map(key => [`set${key[0].toUpperCase()}${key.slice(1)}`, value => setField(key, value)]));
  return { configuration, ...configuration, ...setters, setField, applyPreset: name => dispatch({ type: 'preset', name, info }) };
}
