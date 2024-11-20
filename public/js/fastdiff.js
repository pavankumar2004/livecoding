/*
 * @param {Array|String} a Input array or string.
 * @param {Array|String} b Input array or string.
 * @param {Function} [cmp] Optional function used to compare array values, defaults to `===` (strict equality).
 * @param {Boolean} [atomicChanges=false] Whether an array of `insert|delete|equal` operations should
 * be returned instead of change set. This is compatible with {@link module:utils/diff~diff `diff()`}.
 * @returns {Array} Array of changes.
 */
function fastDiff(a, b, cmp = (a, b) => a === b, atomicChanges = false) {
	// Convert non-array inputs (strings or array-like objects) into arrays.
	if (!Array.isArray(a)) a = Array.prototype.slice.call(a);
	if (!Array.isArray(b)) b = Array.prototype.slice.call(b);

	// Find first and last change indexes.
	const changeIndexes = findChangeBoundaryIndexes(a, b, cmp);

	// Return either atomic changes or detailed changes based on the flag.
	return atomicChanges ? changeIndexesToAtomicChanges(changeIndexes, b.length) : changeIndexesToChanges(b, changeIndexes);
}

/**
 * Finds the boundaries where arrays start and stop changing.
 * @param {Array} arr1 First array.
 * @param {Array} arr2 Second array.
 * @param {Function} cmp Comparison function.
 * @returns {Object} Object containing `firstIndex`, `lastIndexOld`, and `lastIndexNew`.
 */
function findChangeBoundaryIndexes(arr1, arr2, cmp) {
	// Get the index of the first difference.
	const firstIndex = findFirstDifferenceIndex(arr1, arr2, cmp);

	// If no differences, return -1 for all indexes.
	if (firstIndex === -1) return { firstIndex: -1, lastIndexOld: -1, lastIndexNew: -1 };

	// Reverse arrays after removing common elements.
	const oldArrayReversed = cutAndReverse(arr1, firstIndex);
	const newArrayReversed = cutAndReverse(arr2, firstIndex);

	// Find the last change index by comparing the reversed arrays.
	const lastIndex = findFirstDifferenceIndex(oldArrayReversed, newArrayReversed, cmp);

	// Adjust indexes based on array lengths.
	const lastIndexOld = arr1.length - lastIndex;
	const lastIndexNew = arr2.length - lastIndex;

	return { firstIndex, lastIndexOld, lastIndexNew };
}

/**
 * Finds the first index where two arrays differ.
 * @param {Array} arr1 First array.
 * @param {Array} arr2 Second array.
 * @param {Function} cmp Comparison function.
 * @returns {Number} Index of the first difference, or -1 if no differences.
 */
function findFirstDifferenceIndex(arr1, arr2, cmp) {
	for (let i = 0; i < Math.max(arr1.length, arr2.length); i++) {
		if (arr1[i] === undefined || arr2[i] === undefined || !cmp(arr1[i], arr2[i])) {
			return i;
		}
	}
	return -1; // Arrays are identical.
}

/**
 * Returns a reversed copy of the array after removing the first `howMany` elements.
 * @param {Array} arr Array to be processed.
 * @param {Number} howMany How many elements to remove from the start.
 * @returns {Array} Shortened and reversed array.
 */
function cutAndReverse(arr, howMany) {
	return arr.slice(howMany).reverse();
}

/**
 * Converts change indexes into a list of changes for array differences.
 * @param {Array} newArray The new array.
 * @param {Object} changeIndexes The object containing change indexes.
 * @returns {Array} Array of change objects.
 */
function changeIndexesToChanges(newArray, changeIndexes) {
	const { firstIndex, lastIndexOld, lastIndexNew } = changeIndexes;
	const result = [];

	// Handle insertions and deletions separately.
	if (lastIndexNew - firstIndex > 0) {
		result.push({
			index: firstIndex,
			type: 'insert',
			values: newArray.slice(firstIndex, lastIndexNew)
		});
	}

	if (lastIndexOld - firstIndex > 0) {
		result.push({
			index: firstIndex + (lastIndexNew - firstIndex),
			type: 'delete',
			howMany: lastIndexOld - firstIndex
		});
	}

	return result;
}

/**
 * Converts change indexes into a sequence of atomic change operations (`insert`, `delete`, `equal`).
 * @param {Object} changeIndexes The object containing change indexes.
 * @param {Number} newLength The length of the new array.
 * @returns {Array} Array of atomic changes.
 */
function changeIndexesToAtomicChanges(changeIndexes, newLength) {
	const { firstIndex, lastIndexOld, lastIndexNew } = changeIndexes;
	if (firstIndex === -1) return Array(newLength).fill('equal');

	let result = [];
	if (firstIndex > 0) result = result.concat(Array(firstIndex).fill('equal'));
	if (lastIndexNew - firstIndex > 0) result = result.concat(Array(lastIndexNew - firstIndex).fill('insert'));
	if (lastIndexOld - firstIndex > 0) result = result.concat(Array(lastIndexOld - firstIndex).fill('delete'));
	if (lastIndexNew < newLength) result = result.concat(Array(newLength - lastIndexNew).fill('equal'));

	return result;
}

/**
 * Main diffing function for comparing arrays or strings.
 * @param {Array|String} a First array/string.
 * @param {Array|String} b Second array/string.
 * @param {Function} [cmp] Comparison function.
 * @returns {Array} Array of changes between `a` and `b`.
 */
function diff(a, b, cmp) {
	cmp = cmp || ((a, b) => a === b);

	const aLength = a.length;
	const bLength = b.length;

	// Use fastDiff for larger arrays/strings.
	if (aLength > 200 || bLength > 200 || aLength + bLength > 300) {
		return fastDiff(a, b, cmp, true);
	}

	// Swap arrays if necessary.
	let _insert, _delete;
	if (bLength < aLength) {
		[_insert, _delete] = ['delete', 'insert'];
		[a, b] = [b, a];
	} else {
		[_insert, _delete] = ['insert', 'delete'];
	}

	const m = a.length;
	const n = b.length;
	const delta = n - m;
	const es = {}; // Edit scripts.
	const fp = {}; // Furthest points.

	// Snake function to handle diagonal traversal.
	function snake(k) {
		const y1 = (fp[k - 1] !== undefined ? fp[k - 1] : -1) + 1;
		const y2 = fp[k + 1] !== undefined ? fp[k + 1] : -1;
		const dir = y1 > y2 ? -1 : 1;

		if (es[k + dir]) es[k] = es[k + dir].slice(0);
		if (!es[k]) es[k] = [];

		es[k].push(y1 > y2 ? _insert : _delete);

		let y = Math.max(y1, y2);
		let x = y - k;

		while (x < m && y < n && cmp(a[x], b[y])) {
			x++;
			y++;
			es[k].push('equal');
		}

		return y;
	}

	let p = 0;
	let k;

	// Traverse diagonals until reaching the end of the longer string.
	do {
		for (k = -p; k < delta; k++) fp[k] = snake(k);
		for (k = delta + p; k > delta; k--) fp[k] = snake(k);
		fp[delta] = snake(delta);

		p++;
	} while (fp[delta] !== n);

	// Return the final list of changes.
	return es[delta].slice(1);
}

/**
 * Converts diff results into a sequence of changes.
 * @param {Array} diff The diff array.
 * @param {Array} output The output array being compared.
 * @returns {Array} Array of change objects.
 */
function diffToChanges(diff, output) {
	const changes = [];
	let index = 0;
	let lastOperation;

	diff.forEach(change => {
		if (change === 'equal') {
			pushLast();
			index++;
		} else if (change === 'insert') {
			if (isContinuationOf('insert')) {
				lastOperation.values.push(output[index]);
			} else {
				pushLast();
				lastOperation = {
					type: 'insert',
					index,
					values: [output[index]]
				};
			}
			index++;
		} else {
			if (isContinuationOf('delete')) {
				lastOperation.howMany++;
			} else {
				pushLast();
				lastOperation = {
					type: 'delete',
					index,
					howMany: 1
				};
			}
		}
	});

	pushLast();

	return changes;

	function pushLast() {
		if (lastOperation) {
			changes.push(lastOperation);
			lastOperation = null;
		}
	}

	function isContinuationOf(expected) {
		return lastOperation && lastOperation.type === expected;
	}
}

module.exports = {
	diff,
	diffToChanges
};
