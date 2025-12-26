import dotenv from 'dotenv';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import { codefend } from 'rollup-plugin-codefend';
dotenv.config();

const createTsPlugin = () =>
  typescript({
    tsconfig: './tsconfig.json',
    declaration: true,
    declarationDir: './dist',
    sourceMap: true
  });

const baseOutput = {
  format: 'umd',
  name: 'VnsGaUtil',
  sourcemap: true,
  globals: {}
};

const enableObfuscation = process.env.OBFUSCATE === 'true';

export default [
  {
    input: 'src/index.ts',
    output: { ...baseOutput, file: 'dist/vns-ga-utils.js' },
    plugins: [createTsPlugin()]
  },
  {
    input: 'src/index.ts',
    output: { ...baseOutput, sourcemap: false, file: 'dist/vns-ga-utils.min.js' },
    plugins: [
      createTsPlugin(),
      terser(),
      ...(enableObfuscation ? [codefend()] : [])
    ]
  }
];

