# ts-transform-async-import

_Note! This transformer is currently experimental_

A TypeScript custom transformer that turns synchronous imports of async functions into asynchronous imports. The reason being to lazily load code as needed
instead of bundling all code together.

An example would be:

```
// file1.ts
export async function fetchSomething() {
  return await fetch('/something');
}

// file2.ts
import { fetchSomething } from './file1';

button.onclick = () => doSomethingInteresting(await fetchSomething());
```

Which gets turned into:

```
// file1.ts
export async function fetchSomething() {
  return await fetch('/something');
}

// file2.ts
button.onclick = () => doSomethingInteresting(await import('./file1').then(m => m.fetchSomething()));
```

This means that the `fetchSomething` function won't get code loaded until the user clicks on a button, instead of having to load the code on initial page load.

Note that all functions that returns a promise is considered by this transformer, not just explicitly async functions.

## Bail outs

The transformer bails out of removing the import if it sees that the imported function is used for something other than calling it. So in this case:

```
// file2.ts
import { fetchSomething } from './file1';

button.onclick = () => doSomethingInteresting(await fetchSomething());
passItSomewhere(fetchSomething);
```

The import statement won't be removed since it's passed to `passItSomewhere` and we can't modify the program in a way that it's still semantically the same.

## Limitations

The transformer doesn't follow passing imported functions around, which means that this code:

```
// file1.ts
export async function fetchSomething() {
  return await fetch('/something');
}

// file2.ts
import { fetchSomething } from './file1';

function init(fetcher: () => Promise<any>) {
  button.onclick = () => doSomethingInteresting(await fetcher());
}
init(fetchSomething);
```

Won't be optimized/transformed.

## Other useful transform

If you find this transform useful you might want to use this one as well: https://github.com/avensia-oss/ts-transform-export-const-folding

# Installation

```
yarn add @avensia-oss/ts-transform-async-import
```

## Usage with webpack

Unfortunately TypeScript doesn't let you specifiy custom transformers in `tsconfig.json`. If you're using `ts-loader` with webpack you can specify it like this:
https://github.com/TypeStrong/ts-loader#getcustomtransformers-----before-transformerfactory-after-transformerfactory--

The default export of this module is a function which expects a `ts.Program` an returns a transformer function. Your config should look something like this:

```
const asyncImportTransform = require('@avensia-oss/ts-transform-async-import');

return {
  ...
  options: {
    getCustomTransformers: (program) => ({
      before: [asyncImportTransform(program)]
    })
  }
  ...
};
```
