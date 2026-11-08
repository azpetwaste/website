"""Reading level check for the town copy (Flesch Kincaid grade, with a simple syllable counter).
Run: python3 readgrade.py  (prints each town's grade and its hardest sentences)."""
import re
import sys

import cities
import longform

SKIP = {'arizona', 'buckeye', 'goodyear', 'litchfield', 'verrado', 'waddell', 'estrella', 'maricopa', 'sanitizer', 'deodorizer',
        'monsoon', 'pebblecreek', 'tartesso', 'teravalis', 'sundance', 'westpark', 'interstate', 'cantamia', 'centerra', 'cottonflower'}


def syllables(word):
    w = word.lower()
    if w in SKIP:
        return 2  # local names count as easy: readers know them
    w = re.sub(r'[^a-z]', '', w)
    if not w:
        return 0
    if len(w) <= 3:
        return 1
    w = re.sub(r'(?:[^laeiouy]es|ed|[^laeiouy]e)$', '', w)
    w = re.sub(r'^y', '', w)
    n = len(re.findall(r'[aeiouy]{1,2}', w))
    return max(1, n)


def sentences(text):
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if len(s.split()) > 1]


def grade(sents):
    words = [w for s in sents for w in re.findall(r"[A-Za-z0-9’']+", s)]
    if not words:
        return 0
    syl = sum(syllables(w) for w in words)
    return 0.39 * len(words) / len(sents) + 11.8 * syl / len(words) - 15.59


def town_text(cdef):
    t = longform.TOWNS.get(cdef['area'])
    parts = [cdef['intro'], cdef['where'], cdef['why'], cdef['faq']]
    if t:
        parts += [t['hoods_intro']] + [h[2] for h in t['hoods']] + [b for _, _, items in t['sections'] for _, b in items]
    return ' '.join(parts)


if __name__ == '__main__':
    worst_all = []
    for c in cities.CITIES:
        s = sentences(town_text(c))
        g = grade(s)
        words = sum(len(x.split()) for x in s)
        print('%-16s grade %.1f  %d sentences  %d words' % (c['name'], g, len(s), words))
        hard = sorted(s, key=lambda x: -grade([x]))[:4]
        for h in hard:
            print('      %.1f  %s' % (grade([h]), h[:150]))
    sys.exit(0)
