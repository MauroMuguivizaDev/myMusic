function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function artistMatches(expected: string, actual: string): boolean {
  const wanted = normalize(expected);
  if (!wanted) return true;
  const credits = actual.split(/\s+(?:feat(?:uring)?\.?|ft\.?)\s+|\s*[,&+]\s*/i).map(normalize);
  return credits.includes(wanted) || normalize(actual) === wanted;
}

function titleMatches(expected: string, actual: string): boolean {
  const wanted = normalize(expected);
  const title = normalize(actual);
  if (!wanted || !title) return false;
  if (wanted === title || title.startsWith(`${wanted} `) || wanted.startsWith(`${title} `)) return true;
  const tokens = wanted.split(' ').filter(token => token.length > 1);
  if (!tokens.length) return false;
  const matched = tokens.filter(token => title.split(' ').some(word => word === token || (token.length >= 5 && word.startsWith(token))));
  return matched.length / tokens.length >= 0.8;
}

/** Strictly filter results that do not represent the requested title/artist pair. */
export function isRelevantMusicResult(query: string, title: string, artist: string): boolean {
  const input = query.trim();
  const explicit = input.match(/^(.+?)\s+(?:-|–|—|\bby\b)\s+(.+)$/i);
  if (explicit) {
    // Accept the common "Artist - Title" form and the inverse "Title - Artist" form.
    return (artistMatches(explicit[1], artist) && titleMatches(explicit[2], title))
      || (titleMatches(explicit[1], title) && artistMatches(explicit[2], artist));
  }

  const normalizedQuery = normalize(input);
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);
  if (!normalizedQuery || !normalizedTitle) return false;
  if (normalizedQuery === normalizedTitle || normalizedTitle.startsWith(`${normalizedQuery} `) || normalizedQuery.startsWith(`${normalizedTitle} `)) return true;

  const queryTokens = normalizedQuery.split(' ').filter(token => token.length > 1);
  const titleTokens = normalizedTitle.split(' ');
  const titleCoverage = titleTokens.filter(token => queryTokens.some(queryToken => queryToken === token || (queryToken.length >= 5 && token.startsWith(queryToken)))).length / titleTokens.length;
  const artistExact = normalizedArtist === normalizedQuery || artist.split(/\s+(?:feat(?:uring)?\.?|ft\.?)\s+|\s*[,&+]\s*/i).some(part => normalize(part) === normalizedQuery);
  if (artistExact) return true;

  const queryCoverage = queryTokens.filter(token => titleTokens.includes(token) || normalizedArtist.split(' ').includes(token)).length / queryTokens.length;
  return titleCoverage >= 0.6 && queryCoverage >= 0.8;
}
