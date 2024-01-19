export class ArrayUtil {
  static groupConsecutiveNumbers(arr: number[]): number[][] {
    if (arr.length === 0) {
      return [];
    }

    const result: number[][] = [];
    let currentGroup: number[] = [arr[0]];

    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === arr[i - 1] + 1) {
        // Values are consecutive, add to the current group
        currentGroup.push(arr[i]);
      } else {
        // Values are not consecutive, start a new group
        result.push(currentGroup);
        currentGroup = [arr[i]];
      }
    }

    // Add the last group
    result.push(currentGroup);

    return result;
  }

}
