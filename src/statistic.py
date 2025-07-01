#!/usr/bin/env python3
import os
import json
import matplotlib.pyplot as plt

def load_variant_scores(mapped_dir):
    """
    Walk through mapped/*.json and for each file:
      - Read all non-empty lines
      - Parse the last JSON object (most recent run)
      - For each variant take amazon_variant[0].score
      - Build parallel lists of labels and scores
    """
    labels = []
    scores = []

    for fname in sorted(os.listdir(mapped_dir)):
        if not fname.endswith('.json'):
            continue

        path = os.path.join(mapped_dir, fname)
        # read all non-blank lines
        with open(path, 'r', encoding='utf-8') as f:
            lines = [line for line in f.read().splitlines() if line.strip()]
        if not lines:
            continue

        # parse only the last JSON entry
        try:
            doc = json.loads(lines[-1])
        except json.JSONDecodeError:
            print(f"⚠️  Could not parse JSON in {fname}, skipping")
            continue

        product_name = doc.get('name', fname)
        for variant in doc.get('variants', []):
            var_val = variant.get('variant_property_value', 'unknown')
            top_list = variant.get('amazon_variant', [])
            if not top_list:
                continue

            raw_score = top_list[0].get('score', 0)
            try:
                score = float(raw_score)
            except (ValueError, TypeError):
                score = 0.0

            labels.append(f"{product_name} – {var_val}")
            scores.append(score)

    return labels, scores

def plot_scores(labels, scores):
    plt.figure(figsize=(14, 6))
    plt.bar(range(len(scores)), scores)
    plt.xticks(range(len(labels)), labels, rotation=90, ha='right')
    plt.ylabel('Top ASIN Score')
    plt.ylim(0, 1)
    plt.title('Top Amazon‐ASIN Score for Each Variant')
    plt.tight_layout()
    plt.show()

if __name__ == '__main__':
    base_dir = os.path.dirname(__file__)
    mapped_dir = os.path.join(base_dir, 'mapped')

    labels, scores = load_variant_scores(mapped_dir)
    if not labels:
        print("No valid variant scores found in mapped/*.json")
    else:
        plot_scores(labels, scores)
