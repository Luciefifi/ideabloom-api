import { buildPrefixTsQuery } from './search-query';

describe('buildPrefixTsQuery', () => {
  it.each([
    ['plant', 'plant:*'],
    ['Plant  Water ', 'plant:* & water:*'],
    ['ubuhinzi bw’imboga', 'ubuhinzi:* & bwimboga:*'],
    ['café', 'café:*'],
    ['v2', 'v2:*'],
  ])('%s → %s', (input, expected) => {
    expect(buildPrefixTsQuery(input)).toBe(expected);
  });

  it('removes characters that have a special meaning in search syntax', () => {
    expect(buildPrefixTsQuery("a & b | !c :* (d) 'e'")).toBe(
      'a:* & b:* & c:* & d:* & e:*',
    );
  });

  it('returns null when nothing searchable is left', () => {
    expect(buildPrefixTsQuery('   ')).toBeNull();
    expect(buildPrefixTsQuery('&& !!')).toBeNull();
  });

  it('limits very long searches to 10 words', () => {
    const query = buildPrefixTsQuery('w '.repeat(50));
    expect(query?.split(' & ')).toHaveLength(10);
  });
});
