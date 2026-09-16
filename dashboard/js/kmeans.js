/*
 * ScrapLens – K-Means Clustering (kmeans.js)
 * Runs k-means++ initialisation followed by Lloyd's algorithm on the six
 * normalised scrap-input columns. Results are written to the global dbClusters array.
 * Depends on: state.js, utils.js (norm, euclidean)
 */

// Runs k-means++ (max 100 iterations) on normalised scrap columns and stores cluster assignments in dbClusters
function runKMeans(k) {
    dbK = k;
    const n = dbData.length;
    if (n === 0) return;

    // Build a normalised feature vector [0,1]^6 for each row
    const vecs = dbData.map(d => SCRAP_COLS.map(c => norm(+d[c], c)));

    // k-means++ seeding: first centroid is random, subsequent ones prefer distant points
    const centroids = [vecs[Math.floor(Math.random() * n)]];
    while (centroids.length < k) {
        const dists = vecs.map(v => Math.min(...centroids.map(c => euclidean(v, c))));
        const sum   = dists.reduce((a, b) => a + b, 0);
        let r = Math.random() * sum;
        for (let i = 0; i < n; i++) {
            r -= dists[i];
            if (r <= 0) { centroids.push(vecs[i]); break; }
        }
    }

    // Lloyd's algorithm: assign points to nearest centroid, then recompute centroids
    let assignments = new Array(n).fill(0);
    for (let iter = 0; iter < 100; iter++) {
        let changed = false;
        for (let i = 0; i < n; i++) {
            let best = 0, bestD = Infinity;
            for (let j = 0; j < k; j++) {
                const d = euclidean(vecs[i], centroids[j]);
                if (d < bestD) { bestD = d; best = j; }
            }
            if (assignments[i] !== best) { assignments[i] = best; changed = true; }
        }
        if (!changed) break; // converged — no point switched clusters

        // Recompute each centroid as the mean of its member vectors
        for (let j = 0; j < k; j++) {
            const members = vecs.filter((_, i) => assignments[i] === j);
            if (members.length === 0) continue;
            centroids[j] = centroids[j].map((_, d) =>
                members.reduce((s, v) => s + v[d], 0) / members.length
            );
        }
    }

    dbClusters = assignments;
}
