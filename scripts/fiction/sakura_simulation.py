"""Reproduce the experiments in 你永远追不上樱花飘落的速度.
Requires Python 3 and NumPy. Run with --out DIR to save the summary and plot data.
"""
import argparse
import json
from math import comb
from collections import deque
from pathlib import Path
from statistics import NormalDist

import numpy as np


def match(preferences, other_ranks):
    """Each queue pop is one new invitation. A lower rank is preferred."""
    n = len(preferences)
    free = deque(range(n))
    next_choice = np.zeros(n, dtype=int)
    held = np.full(n, -1, dtype=int)
    while free:
        i = free.popleft()
        j = preferences[i, next_choice[i]]
        next_choice[i] += 1
        old = held[j]
        if old < 0 or other_ranks[j, i] < other_ranks[j, old]:
            held[j] = i
            if old >= 0:
                free.append(old)
        else:
            free.append(i)
    partner = np.argsort(held)
    rows = np.arange(n)
    own_ranks = preferences.argsort(axis=1)
    assert np.array_equal(next_choice, own_ranks[rows, partner] + 1)
    blocking = ((own_ranks < own_ranks[rows, partner, None])
                & (other_ranks.T < other_ranks[rows, held][None, :]))
    assert not blocking.any()
    return next_choice, other_ranks[partner, rows] + 1


def threshold_curve(n, p):
    curve = []
    for r in range(n):
        survive = 1.
        win = 0.
        for k in range(r+1, n+1):
            win += (1-p)*survive/n
            survive *= 1-(1-p)/k
        curve.append(win)
    return np.array(curve)


def stopping(n, p, trials, rng):
    curve = threshold_curve(n,p)
    r = int(np.argmax(curve))
    successes = 0
    for offset in range(0,trials,1000):
        batch = min(1000,trials-offset)
        values = rng.random((batch,n))
        record = values == np.maximum.accumulate(values,axis=1)
        record[:, :r] = False
        viable = record & (rng.random((batch,n)) >= p)
        successes += np.count_nonzero(viable.any(axis=1) &
            (viable.argmax(axis=1) == values.argmax(axis=1)))
    return r, float(curve[r]), successes/trials


def fixed_available(n, r):
    """Win probability at each count K of available receivers, K=0..n."""
    conditional = np.zeros((n+1,n+1))
    for K in range(1,n+1):
        for l in range(n-K+1):
            conditional[K,l] = K/n * comb(n-K,l)/comb(n-1,l)
    pmf = np.array([1.])
    win = np.zeros(n+1)
    for k in range(r+1,n+1):
        win += conditional[:,:len(pmf)] @ pmf / n
        pmf = np.convolve(pmf,[1-1/k,1/k])
    return win


def outsider(ranks, repetitions, rng, exact):
    batch, n = repetitions, len(ranks)
    # Index each receiver by her incumbent. Shuffling below makes these labels immaterial.
    available = rng.random((batch,n)) < ranks/(n+1)
    order = rng.random((batch,n)).argsort(axis=1)
    in_order = np.take_along_axis(available,order,axis=1)
    grades = rng.random((batch,n))
    records = grades == np.maximum.accumulate(grades,axis=1)
    best = grades.argmax(axis=1)
    K = available.sum(axis=1)
    result = []
    for r, by_K in exact.items():
        offers = np.arange(n)[None,:] >= r
        eligible = records & offers & in_order
        win = eligible.any(axis=1) & (eligible.argmax(axis=1)==best)
        result.append([win.mean(),by_K[K].mean()])
    return result

def main(out):
    seed, n, repetitions = 20261106, 50, 2000
    rng = np.random.default_rng(seed)
    quality = np.array([NormalDist().inv_cdf((i+.5)/n) for i in range(n)])
    worlds = ['independent','male025','male1','female1']
    data = {name:[] for name in worlds}
    counts = np.zeros(n)
    outside_rng = np.random.default_rng(seed+2)
    thresholds = {r: fixed_available(n,r) for r in [0,8,18]}
    joined, accept = [], []
    for _ in range(repetitions):
        male, female = rng.standard_normal((2,n,n))
        for label, x, y in [
            ('independent',male,female), ('male025',male,female+.25*quality),
            ('male1',male,female+quality), ('female1',male+quality,female)]:
            invites, receiver_rank = match((-x).argsort(axis=1),(-y).argsort(axis=1).argsort(axis=1))
            first = invites==1
            data[label].append((invites.mean(), first.mean(), (receiver_rank==1).mean(),
                                (first & (receiver_rank==1)).mean()))
            if label=='independent':
                joined.append(outsider(receiver_rank,64,outside_rng,thresholds))
                accept.append(receiver_rank.mean()/(n+1))
            if label=='male1':
                counts += invites
    arr = {key:np.array(vals) for key,vals in data.items()}
    summary = {}
    for key, vals in arr.items():
        delta = vals[:,0]-arr['independent'][:,0]
        summary[key] = dict(means=vals.mean(axis=0).tolist(),
            se=vals.std(axis=0,ddof=1).tolist(), paired_change=float(delta.mean()),
            paired_se=float(delta.std(ddof=1)/np.sqrt(repetitions)))
        summary[key]['se'] = [x/np.sqrt(repetitions) for x in summary[key]['se']]
    summary['fixed_quality'] = dict(lowest_ten=float(counts[:10].mean()/repetitions),
                                    highest_ten=float(counts[-10:].mean()/repetitions))
    srng = np.random.default_rng(seed+1)
    summary['stopping'] = {str(p):stopping(n,p,100000,srng) for p in [0,.25,.5,.75,.9]}
    joined = np.array(joined)
    summary['outsider'] = dict(r=list(thresholds), acceptance=float(np.mean(accept)),
        results=joined.mean(axis=0).tolist(),
        se=(joined.std(axis=0,ddof=1)/np.sqrt(repetitions)).tolist())
    out.mkdir(parents=True,exist_ok=True)
    (out/'results.json').write_text(json.dumps(summary,indent=2))
    np.savez_compressed(out/'matches.npz', quality=quality,individual=counts/repetitions,**arr)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    main(parser.parse_args().out)
