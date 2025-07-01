#!/usr/bin/env python3
import os
import json
import numpy as np
import matplotlib.pyplot as plt

def load_top_variant_scores(mapped_dir):
    """
    Read every mapped/*.json (single JSON object per file) and return a flat list
    of each variant's top amazon_variant[0].score as floats.
    """
    scores = []

    for fname in sorted(os.listdir(mapped_dir)):
        if not fname.endswith('.json'):
            continue

        path = os.path.join(mapped_dir, fname)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                doc = json.load(f)
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠️  Skipping {fname}: {e}")
            continue

        for variant in doc.get('variants', []):
            top_list = variant.get('amazon_variant', [])
            if not top_list:
                continue

            raw_score = top_list[0].get('score', 0)
            try:
                score = float(raw_score)
            except (ValueError, TypeError):
                score = 0.0

            scores.append(score)

    return scores

def plot_histogram(scores, bin_width=0.05):
    # Determine bin edges from 0 up to max_score rounded up
    max_score = max(scores) if scores else 0.0
    num_bins = int(np.ceil(max_score / bin_width))
    edges = np.arange(0.0, (num_bins + 1) * bin_width, bin_width)

    counts, _ = np.histogram(scores, bins=edges)
    total = counts.sum()

    # Build labels like "0.00–0.05", "0.05–0.10", ...
    labels = [f"{edges[i]:.2f}–{edges[i+1]:.2f}" for i in range(len(counts))]

    # Plot
    fig, ax = plt.subplots(figsize=(10, 4))
    bars = ax.bar(range(len(counts)), counts, width=0.8, align='center')

    # Annotate each bar with percentage
    for i, bar in enumerate(bars):
        height = bar.get_height()
        pct = (height / total * 100) if total > 0 else 0
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            height + max(counts) * 0.01,            # slightly above the bar
            f"{pct:.1f}%",
            ha='center',
            va='bottom',
            fontsize=8
        )

    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=45, ha='right')
    ax.set_xlabel('Top ASIN Score Range')
    ax.set_ylabel('Number of Variants')
    ax.set_title(f'Variant Count per {bin_width:.2f}-Point Score Bin')
    plt.tight_layout()
    plt.show()
    
    
if __name__ == '__main__':
    base_dir = os.path.dirname(__file__)
    mapped_dir = os.path.join(base_dir, 'mapped')

    scores = load_top_variant_scores(mapped_dir)
    if not scores:
        print("No scores to plot.")
    else:
        plot_histogram(scores, bin_width=0.05)
