# Music

Drop your audio files (`.mp3`, `.ogg`, `.m4a`, `.wav`) into this folder and list them in
`playlist.json`:

```json
{
  "tracks": [
    { "file": "quiet-rain.mp3", "title": "Quiet Rain", "artist": "Someone" },
    { "file": "hanami.mp3", "title": "Hanami", "artist": "Someone Else" }
  ]
}
```

The player streams them, shuffles by default and crossfades between tracks over ~3 seconds.
While the list is empty, the game plays a soft generative ambient station instead, so it is
never silent.

## Where to find soothing, legally usable music

Check the licence on each individual track before shipping — "free to listen" is not the same
as "free to redistribute".

- **Pixabay Music** — https://pixabay.com/music/ (Pixabay Content Licence, no attribution needed)
- **Free Music Archive** — https://freemusicarchive.org/ (filter by CC0 / CC-BY)
- **Chosic** — https://www.chosic.com/free-music/all/ (aggregates CC tracks, tags the licence)
- **Kevin MacLeod / Incompetech** — https://incompetech.com/music/ (CC-BY with attribution)
- **Uppbeat**, **Epidemic Sound**, **Artlist** — subscription libraries if this ever goes commercial

Good search terms for this game: *lo-fi*, *ambient piano*, *japanese koto*, *shakuhachi*,
*chillhop*, *slow jazz*, *city pop ballad*.

If you use CC-BY tracks, credit the artists — the `artist` field in `playlist.json` is shown
in the now-playing card while the track plays.
