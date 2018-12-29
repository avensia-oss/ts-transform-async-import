import compile from './compile';

type Code = { [fileName: string]: string };

test('single async import removes import', () => {
  const code = {
    'file1.ts': `
export async function x() { 
    return true; 
}
`,
    'file2.ts': `
import { x } from "./file1";

async function init() {
    const y = await x();
}
init();
    `,
  };

  const expected = {
    'file1.js': `
export async function x() {
    return true;
}
`,
    'file2.js': `
async function init() {
    const y = await import("./file1").then(m => m.x());
}
init();
`,
  };

  expectEqual(expected, compile(code));
});

test('single async import with alias name removes import', () => {
  const code = {
    'file1.ts': `
export async function x() { 
    return true; 
}
`,
    'file2.ts': `
import { x as y } from "./file1";

async function init() {
    const z = await y();
}
init();
    `,
  };

  const expected = {
    'file1.js': `
export async function x() {
    return true;
}
`,
    'file2.js': `
async function init() {
    const z = await import("./file1").then(m => m.x());
}
init();
`,
  };

  expectEqual(expected, compile(code));
});

test('async import as well as non async import only removes the async import', () => {
  const code = {
    'file1.ts': `
export async function x() { 
    return true; 
}
export function y() {
    return false;
}
`,
    'file2.ts': `
import { x, y } from "./file1";
async function init() {
    const z = await x();
}
init();
y();
    `,
  };

  const expected = {
    'file1.js': `
export async function x() {
    return true;
}
export function y() {
    return false;
}
`,
    'file2.js': `
import { y } from "./file1";
async function init() {
    const z = await import("./file1").then(m => m.x());
}
init();
y();
`,
  };

  expectEqual(expected, compile(code));
});

test('single async const function import removes import', () => {
  const code = {
    'file1.ts': `
export const x = async () => {
    return true;
};
  `,
    'file2.ts': `
import { x } from "./file1";
  
async function init() {
    const y = await x();
}
init();
      `,
  };

  const expected = {
    'file1.js': `
export const x = async () => {
    return true;
};
  `,
    'file2.js': `
async function init() {
    const y = await import("./file1").then(m => m.x());
}
init();
  `,
  };

  expectEqual(expected, compile(code));
});

test('single async default export function removes import', () => {
  const code = {
    'file1.ts': `
export default async () => {
    return true;
};
  `,
    'file2.ts': `
import x from "./file1";
  
async function init() {
    const y = await x();
}
init();
      `,
  };

  const expected = {
    'file1.js': `
export default async () => {
    return true;
};
  `,
    'file2.js': `
async function init() {
    const y = await import("./file1").then(m => m.default());
}
init();
  `,
  };

  expectEqual(expected, compile(code));
});

test('single async import is not removed if import is used as something other than calling', () => {
  const code = {
    'file1.ts': `
export async function x() { 
    return true; 
}
export function q(x: any) {
    return x;
}
`,
    'file2.ts': `
import { x, q } from "./file1";

async function init() {
    const y = await x();
}
init();
q(x);
    `,
  };

  const expected = {
    'file1.js': `
export async function x() {
    return true;
}
export function q(x) {
    return x;
}
`,
    'file2.js': `
import { x, q } from "./file1";
async function init() {
    const y = await import("./file1").then(m => m.x());
}
init();
q(x);
`,
  };

  expectEqual(expected, compile(code));
});

test('exported function from other module works', () => {
  const code = {
    'file1.ts': `
export default async () => {
    return true;
};
    `,
    'file2.ts': `
export { default as x } from "./file1";
    `,
    'file3.ts': `
import { x } from "./file2";

async function init() {
    const y = await x();
}
init();
    `,
  };

  const expected = {
    'file1.js': `
export default async () => {
    return true;
};
    `,
    'file2.js': `
export { default as x } from "./file1";
    `,
    'file3.js': `
async function init() {
    const y = await import("./file2").then(m => m.x());
}
init();
    `,
  };

  expectEqual(expected, compile(code));
});

function expectEqual(expected: Code, compiled: Code) {
  Object.keys(expected).forEach(fileName => {
    expect(fileName + ':\n' + compiled[fileName].trim()).toBe(fileName + ':\n' + expected[fileName].trim());
  });
}
