import {useEffect, useState} from 'react';

// Tracks a media query so layout decisions follow the viewport instead of the
// width the page happened to load at.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    try { return matchMedia(query).matches; } catch { return false; }
  });
  useEffect(() => {
    let media;
    try { media = matchMedia(query); } catch { return; }
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}
