const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const serverRoot = path.resolve(__dirname, '..');
function loadModule(variant, { timezone, now = '2026-10-03T12:34:56Z' } = {}) {
  let constructions = 0;
  const DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
    construct(target, args) { constructions++; return Reflect.construct(target, args); },
    apply(target, self, args) { constructions++; return Reflect.apply(target, self, args); },
  });
  const dateIntl = { DateTimeFormat };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const env = timezone === undefined ? {} : { GYM_TIMEZONE: timezone };
  const context = vm.createContext({ Intl: dateIntl, Date: FixedDate, Map, process: { env } });
  function compile(source, imports = {}) {
    const exports = {};
    context.__exports = exports;
    context.__require = (name) => {
      if (!(name in imports)) throw new Error('Unexpected module dependency: ' + name);
      return imports[name];
    };
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new vm.Script('(function(exports, require) {\n' + js + '\n})(__exports, __require)').runInContext(context);
    return exports;
  }
  const factory = compile(fs.readFileSync(path.join(serverRoot, 'src/lib/timezone-formatter.ts'), 'utf8'));
  const source = variant === 'before'
    ? fs.readFileSync(path.join(__dirname, 'fixtures/mx-time-before.ts.txt'), 'utf8')
    : fs.readFileSync(path.join(serverRoot, 'src/lib/mx-time.ts'), 'utf8');
  const functions = compile(source, { './timezone-formatter.js': factory });
  return { functions, factory, count: () => constructions };
}
function result(fn, ...args) {
  try {
    const value = fn(...args);
    return { kind: 'value', value: value instanceof Date ? value.getTime() : value };
  } catch (e) { return { kind: 'error', name: e.name, message: e.message }; }
}
module.exports = { loadModule, result };
