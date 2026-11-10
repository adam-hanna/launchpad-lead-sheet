# Chord symbol grammar

Normative for `src/core/theory/chords.ts` (plan §4.9). The tests in `chords.test.ts` cover every row below;
add a row and a test together.

## Shape

```
<root> <quality> <alteration>* [ "/" <bass> ]
```

- **root**: `A`–`G` (upper case) with optional accidental `#`, `b`, `##`, `x`, `bb`, `♯`, `♭`.
- **quality**: one alias from the table below, matched longest-first, directly after the root. The empty
  quality is a major triad. **Case matters**: `M7` is major seventh, `m7` minor seventh.
- **alterations**: zero or more tokens from the alteration table, in any order, applied left to right.
- **bass**: a note name after the last `/`. `6/9` is a quality, not a slash chord, because `9` is not a
  note name.
- **Parentheses, commas and spaces** inside the symbol are ignored: `C7(b9,#11)` ≡ `C7b9#11`,
  `Am(add9)` ≡ `Amadd9`, `Cm7(b5)` ≡ `Cm7b5`.
- The user's spelling of the symbol, root and bass is preserved (`C#m7` and `Dbm7` are different text,
  identical pitch classes).

## Functions

Each resulting pitch class carries one function used by lighting (plan §4.6):

| Function    | Carried by                                                         |
| ----------- | ------------------------------------------------------------------ |
| `root`      | the root                                                           |
| `third`     | major or minor 3rd, **or the suspended 2nd/4th that replaces it**  |
| `fifth`     | perfect, diminished or augmented 5th                               |
| `seventh`   | minor, major or diminished (bb) 7th                                |
| `extension` | 6th, 9th, 11th, 13th and all `add` tones and altered 9/11/13       |
| `bass`      | the slash bass (assigned by role resolution, not stored as a tone) |

When two intervals land on the same pitch class the higher-priority function wins
(`bass › root › third › fifth › seventh › extension`), e.g. `C7#5b13` keeps G# as `fifth`.

## Qualities

Intervals in semitones above the root; `(fn)` names the function where it is not obvious.

| Canonical       | Aliases                                                       | Intervals                                      |
| --------------- | ------------------------------------------------------------- | ---------------------------------------------- |
| major           | `` (empty), `maj`, `M`, `major`                               | 0 4 7                                          |
| minor           | `m`, `min`, `-`, `minor`                                      | 0 3 7                                          |
| diminished      | `dim`, `°`, `o`                                               | 0 3 6                                          |
| augmented       | `aug`, `+`                                                    | 0 4 8                                          |
| power           | `5`                                                           | 0 7                                            |
| sus2            | `sus2`                                                        | 0 2(third) 7                                   |
| sus4            | `sus4`, `sus`                                                 | 0 5(third) 7                                   |
| six             | `6`, `maj6`, `M6`                                             | 0 4 7 9(ext)                                   |
| minorSix        | `m6`, `min6`, `-6`                                            | 0 3 7 9(ext)                                   |
| sixNine         | `6/9`, `69`, `6add9`                                          | 0 4 7 9(ext) 14(ext)                           |
| add9            | `add9`, `add2`                                                | 0 4 7 14(ext)                                  |
| minorAdd9       | `madd9`, `madd2`                                              | 0 3 7 14(ext)                                  |
| dominant7       | `7`, `dom7`                                                   | 0 4 7 10                                       |
| major7          | `maj7`, `M7`, `Δ`, `Δ7`, `ma7`, `major7`                      | 0 4 7 11                                       |
| minor7          | `m7`, `min7`, `-7`, `minor7`                                  | 0 3 7 10                                       |
| minorMajor7     | `mMaj7`, `mmaj7`, `mM7`, `minMaj7`, `mΔ7`, `mΔ`, `-Δ7`, `-M7` | 0 3 7 11                                       |
| diminished7     | `dim7`, `°7`, `o7`                                            | 0 3 6 9(seventh)                               |
| halfDiminished7 | `ø`, `ø7`, `m7b5`, `min7b5`, `-7b5`                           | 0 3 6 10                                       |
| augmented7      | `aug7`, `+7`, `7#5`, `7+5`, `7+`                              | 0 4 8 10                                       |
| augmentedMajor7 | `maj7#5`, `M7#5`, `Δ7#5`, `+Δ7`, `+maj7`, `augMaj7`           | 0 4 8 11                                       |
| dominant7sus4   | `7sus4`, `7sus`                                               | 0 5(third) 7 10                                |
| dominant9       | `9`                                                           | 0 4 7 10 14                                    |
| major9          | `maj9`, `M9`, `Δ9`                                            | 0 4 7 11 14                                    |
| minor9          | `m9`, `min9`, `-9`                                            | 0 3 7 10 14                                    |
| dominant9sus4   | `9sus4`, `9sus`                                               | 0 5(third) 7 10 14                             |
| dominant11      | `11`                                                          | 0 4 7 10 14 17                                 |
| minor11         | `m11`, `min11`, `-11`                                         | 0 3 7 10 14 17                                 |
| dominant13      | `13`                                                          | 0 4 7 10 14 21 (11th omitted, as conventional) |
| major13         | `maj13`, `M13`, `Δ13`                                         | 0 4 7 11 14 21                                 |
| minor13         | `m13`, `min13`, `-13`                                         | 0 3 7 10 14 21                                 |

## Alterations

| Token           | Effect                           |
| --------------- | -------------------------------- |
| `b5`            | replace the fifth with 6         |
| `#5`            | replace the fifth with 8         |
| `b9`            | add 13 (ext)                     |
| `#9`            | add 15 (ext)                     |
| `#11`           | add 18 (ext)                     |
| `b13`           | add 20 (ext)                     |
| `add9`, `add2`  | add 14 (ext)                     |
| `add11`, `add4` | add 17 (ext)                     |
| `add13`, `add6` | add 21 (ext)                     |
| `no3`, `omit3`  | remove the third                 |
| `no5`, `omit5`  | remove the fifth                 |
| `sus4`          | replace the third with 5 (third) |
| `sus2`          | replace the third with 2 (third) |

Adding an interval that is already present is a no-op. Removing a function that is absent is a no-op.

## Examples

| Symbol                   | Pitch classes (C = 0) | Notes                    |
| ------------------------ | --------------------- | ------------------------ |
| `C`                      | 0 4 7                 |                          |
| `Cmaj7`                  | 0 4 7 11              |                          |
| `Cm7b5` / `Cø7`          | 0 3 6 10              |                          |
| `C7b9#11` / `C7(b9,#11)` | 0 1 4 6 7 10          |                          |
| `C6/9`                   | 0 2 4 7 9             | quality, not slash       |
| `C/E`                    | 0 4 7, bass 4         | E is `bass` for lighting |
| `Am/G`                   | 9 0 4, bass 7         | bass outside the chord   |
| `G7(b9)/B`               | 7 11 2 5 8, bass 11   |                          |
| `Cmaj7sus4`              | 0 5 7 11              | sus as an alteration     |
| `Cadd9(no3)`             | 0 2 7                 |                          |

## Rejected

| Symbol   | Error position | Why                                                                |
| -------- | -------------- | ------------------------------------------------------------------ |
| ``       | 0              | empty                                                              |
| `H7`     | 0              | not a root                                                         |
| `7`      | 0              | no root                                                            |
| `Cfoo`   | 1              | unknown quality                                                    |
| `C7alt`  | 2              | `alt` is ambiguous; spell the alterations                          |
| `Cmaj7x` | 5              | unknown token after the quality                                    |
| `C7/H`   | 2              | `/H` is not a bass note, so `7/H` is parsed as a quality and fails |

Errors are `ChordParseError { symbol, position, message }`; positions index the trimmed symbol and are
approximate when parentheses were used.

## Not in v1

Polychords (`C|D`), `alt`, `omit` lists with several tones, Roman numerals, Nashville numbers, chord
qualities written as `Maj`/`Min` with a capital (use `maj`/`min`), and `-` as a key separator.
