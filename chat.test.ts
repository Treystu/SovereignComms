import { describe, it, expect } from 'vitest';
import { formatMessage } from './Chat';

describe('Chat message formatting', () => {
  it('escapes HTML, formats markdown, and links URLs', () => {
    const input = '**bold** *italic* `code` <b>html</b>\nhttps://example.com';
    const output = formatMessage(input);
    expect(output).toContain('<strong>bold</strong>');
    expect(output).toContain('<em>italic</em>');
    expect(output).toContain('<code>code</code>');
    expect(output).toContain('&lt;b&gt;html&lt;/b&gt;');
    expect(output).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener">https://example.com</a>',
    );
    expect(output).toContain('<br/>');
  });
});
