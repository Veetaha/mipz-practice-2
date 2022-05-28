# Ponalyzer

This is a CLI to calculate various code metrics for TypeScript projects.

## Installation

```
git clone git@github.com:Veetaha/mipz-practice-2.git
cd mipz-practice-2.git
npm install
```

## Usage

Invoke the CLI using `npm start` and passing the path to the project root source file to analyze.

For example, analyze the code of `angular` compiler CLI cloned under `~/dev/angular`:

```bash
npm start npm start ~/dev/angular/packages/compiler-cli/index.ts
```

This will output a big JSON object to `stdout`. You can write it to file or pipe to any other tool for further analysis.
