export interface TestCase<Input, Output> {
  name?: string
  input: Input
  expected: Output
}

// Runs fn against each case's input and asserts the result equals expected,
// so a lambda's business logic can be tested as a plain input/output table.
export function describeCases<Input, Output>(
  fnName: string,
  fn: (input: Input) => Output,
  cases: TestCase<Input, Output>[],
): void {
  describe(fnName, () => {
    for (const { name, input, expected } of cases) {
      const testName = name ?? `${JSON.stringify(input)} -> ${JSON.stringify(expected)}`
      it(testName, () => {
        expect(fn(input)).toEqual(expected)
      })
    }
  })
}

