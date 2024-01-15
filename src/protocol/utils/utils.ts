export function ceilDivideByTwoThirds(number: number) {
      const result = number * 0.67; // 0.67 to be safe;
      const ceilResult = Math.ceil(result);
      return ceilResult;
}
