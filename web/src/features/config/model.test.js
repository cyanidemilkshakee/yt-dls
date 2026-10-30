import { describe, expect, it } from 'vitest';
import { buildOptions, configurationReducer, createConfiguration, estimateSize, presetValues } from './model';

const info = { title: 'Test', best_video_ids: ['v1'], best_audio_ids: ['a1'], video_formats: [{ id: 'v1', type: 'video', filesize: 100 }, { id: 'v2', type: 'video', filesize: 200 }, { id: 'combined', type: 'combined', filesize: 180 }], audio_formats: [{ id: 'a1', filesize: 30 }, { id: 'a2', filesize: null }] };
describe('download configuration', () => {
  it('a new preset clears every earlier conversion and metadata choice', () => {
    const dirty = { ...createConfiguration(info), recodeCheck: true, recodeFormat: 'webm', convertSubsCheck: true, subtitleLang: 'en', subtitlesEnabled: true, embedMetadata: true, audioFormat: 'mp3', splitChapters: true };
    const selected = configurationReducer(dirty, { type: 'preset', name: 'hq-mp4', info });
    expect(selected).toMatchObject({ outputFormat: 'mp4', recodeCheck: false, convertSubsCheck: false, subtitleLang: 'none', embedMetadata: false, splitChapters: false, audioFormat: 'best' });
  });
  it('manual edits mark the preset custom and conflicting conversions cannot coexist', () => {
    let state = configurationReducer(createConfiguration(info), { type: 'set', key: 'remuxCheck', value: true });
    state = configurationReducer(state, { type: 'set', key: 'recodeCheck', value: true });
    expect(state).toMatchObject({ activePreset: 'custom', remuxCheck: false, recodeCheck: true, recodeFormat: 'mp4' });
  });
  it('adds all selected streams without double-counting combined audio', () => {
    const state = { ...createConfiguration(info), multiVideo: true, selectedVideoIds: new Set(['v1', 'v2']) };
    expect(estimateSize(info, state).totalBytes).toBe(330);
    expect(estimateSize(info, { ...state, multiVideo: false, selectedVideoIds: new Set(['combined']) }).totalBytes).toBe(180);
    expect(estimateSize(info, { ...state, selectedAudioIds: new Set(['a2']) }).incomplete).toBe(true);
  });
  it('cannot estimate source-specific streams for custom selectors or whole playlists', () => {
    expect(estimateSize(info, { ...createConfiguration(info), customFormat: 'best' }).totalBytes).toBe(0);
    expect(estimateSize({ ...info, _type: 'playlist' }, createConfiguration(info))).toMatchObject({ totalBytes: 0, incomplete: true });
  });
  it('mode changes and restored presets preserve valid audio extraction and pure video selections', () => {
    const state = { ...createConfiguration(info), selectedVideoIds: new Set(['combined']) };
    const video = configurationReducer(state, { type: 'set', key: 'downloadMode', value: 'video', info });
    expect([...video.selectedVideoIds]).toEqual(['v1']);
    const audio = configurationReducer(video, { type: 'set', key: 'savedPreset', value: { downloadMode: 'audio', extractAudio: false }, info });
    expect(buildOptions(info, audio)).toMatchObject({ extractAudio: true, downloadMode: 'audio', formatCode: 'a1/best' });
    expect(configurationReducer(audio, { type: 'set', key: 'downloadMode', value: 'both', info }).extractAudio).toBe(false);
  });
  it('stored presets reject invalid enums and exclude security-sensitive or source-specific fields', () => {
    const saved = presetValues({ ...createConfiguration(info), outputFormat: 'invalid', audioFormat: 'alac', postprocessorArgs: 'secret', customSubtitleLang: '\0en' });
    expect(saved.audioFormat).toBe('alac');
    ['outputFormat', 'postprocessorArgs', 'customSubtitleLang', 'filenameBase', 'downloadPath', 'selectedVideoIds'].forEach(key => expect(saved).not.toHaveProperty(key));
  });
});
