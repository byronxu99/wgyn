// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');
    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      // optimize away arguments usage in common cases
      if (sig.length === 1) {
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func);
        };
      } else if (sig.length === 2) {
        sigCache[func] = function dynCall_wrapper(arg) {
          return Runtime.dynCall(sig, func, [arg]);
        };
      } else {
        // general case
        sigCache[func] = function dynCall_wrapper() {
          return Runtime.dynCall(sig, func, Array.prototype.slice.call(arguments));
        };
      }
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { assert(DYNAMICTOP_PTR);var ret = HEAP32[DYNAMICTOP_PTR>>2];var end = (((ret + size + 15)|0) & -16);HEAP32[DYNAMICTOP_PTR>>2] = end;if (end >= TOTAL_MEMORY) {var success = enlargeMemory();if (!success) {HEAP32[DYNAMICTOP_PTR>>2] = ret;return 0;}}return ret;},
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = false; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = Runtime.stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface.
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }

  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if (!runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var hasLibcxxabi = !!Module['___cxa_demangle'];
  if (hasLibcxxabi) {
    try {
      var s = func.substr(1);
      var len = lengthBytesUTF8(s)+1;
      var buf = _malloc(len);
      stringToUTF8(s, buf, len);
      var status = _malloc(4);
      var ret = Module['___cxa_demangle'](buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed
    } catch(e) {
      // ignore problems here
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
    // failure when using libcxxabi, don't demangle
    return func;
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  return text.replace(/__Z[\w\d_]+/g, function(x) { var y = demangle(x); return x === y ? x : (x + ' [' + y + ']') });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
  if (x % 4096 > 0) {
    x += (4096 - (x % 4096));
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - asm.stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;

var totalMemory = 64*1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2*TOTAL_STACK) {
  if (totalMemory < 16*1024*1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16*1024*1024
  }
}
if (totalMemory !== TOTAL_MEMORY) {
  Module.printErr('increasing TOTAL_MEMORY to ' + totalMemory + ' to be compliant with the asm.js spec (and given that TOTAL_STACK=' + TOTAL_STACK + ')');
  TOTAL_MEMORY = totalMemory;
}

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  buffer = new ArrayBuffer(TOTAL_MEMORY);
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
function writeStringToMemory(string, buffer, dontAddNull) {
  Runtime.warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var lastChar, end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  HEAP8.set(array, buffer);    
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

if (!Math['trunc']) Math['trunc'] = function(x) {
  return x < 0 ? Math.ceil(x) : Math.floor(x);
};
Math.trunc = Math['trunc'];

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;


// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 11488;
  /* global initializers */  __ATINIT__.push();
  

/* memory initializer */ allocate([0,2,0,0,230,12,0,0,40,2,0,0,70,13,0,0,32,0,0,0,0,0,0,0,40,2,0,0,243,12,0,0,48,0,0,0,0,0,0,0,0,2,0,0,20,13,0,0,40,2,0,0,33,13,0,0,16,0,0,0,0,0,0,0,40,2,0,0,105,14,0,0,8,0,0,0,0,0,0,0,40,2,0,0,118,14,0,0,8,0,0,0,0,0,0,0,40,2,0,0,134,14,0,0,88,0,0,0,0,0,0,0,40,2,0,0,187,14,0,0,32,0,0,0,0,0,0,0,40,2,0,0,151,14,0,0,120,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,208,40,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,152,0,0,0,16,1,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,216,44,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,0,221,12,0,0,0,0,0,0,16,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,0,0,14,0,0,0,0,0,0,0,56,0,0,0,7,0,0,0,15,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,16,0,0,0,17,0,0,0,18,0,0,0,0,0,0,0,72,0,0,0,19,0,0,0,20,0,0,0,21,0,0,0,0,0,0,0,88,0,0,0,22,0,0,0,23,0,0,0,24,0,0,0,0,0,0,0,104,0,0,0,22,0,0,0,25,0,0,0,24,0,0,0,10,0,32,43,32,0,32,45,32,0,40,0,41,0,32,120,32,0,32,47,32,0,94,0,108,111,103,95,0,33,0,37,51,100,58,32,0,78,111,32,115,111,108,117,116,105,111,110,32,102,111,117,110,100,10,0,83,111,108,118,101,100,32,37,100,47,49,48,48,10,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,45,43,32,32,32,48,88,48,120,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,46,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,98,97,115,105,99,95,115,116,114,105,110,103,0,37,100,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,101,120,99,101,112,116,105,111,110,32,111,102,32,116,121,112,101,32,37,115,58,32,37,115,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,101,120,99,101,112,116,105,111,110,32,111,102,32,116,121,112,101,32,37,115,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,102,111,114,101,105,103,110,32,101,120,99,101,112,116,105,111,110,0,116,101,114,109,105,110,97,116,105,110,103,0,117,110,99,97,117,103,104,116,0,83,116,57,101,120,99,101,112,116,105,111,110,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,54,95,95,115,104,105,109,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,116,121,112,101,95,105,110,102,111,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,48,95,95,115,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,112,116,104,114,101,97,100,95,111,110,99,101,32,102,97,105,108,117,114,101,32,105,110,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,95,102,97,115,116,40,41,0,99,97,110,110,111,116,32,99,114,101,97,116,101,32,112,116,104,114,101,97,100,32,107,101,121,32,102,111,114,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,40,41,0,99,97,110,110,111,116,32,122,101,114,111,32,111,117,116,32,116,104,114,101,97,100,32,118,97,108,117,101,32,102,111,114,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,40,41,0,116,101,114,109,105,110,97,116,101,95,104,97,110,100,108,101,114,32,117,110,101,120,112,101,99,116,101,100,108,121,32,114,101,116,117,114,110,101,100,0,116,101,114,109,105,110,97,116,101,95,104,97,110,100,108,101,114,32,117,110,101,120,112,101,99,116,101,100,108,121,32,116,104,114,101,119,32,97,110,32,101,120,99,101,112,116,105,111,110,0,115,116,100,58,58,98,97,100,95,97,108,108,111,99,0,83,116,57,98,97,100,95,97,108,108,111,99,0,83,116,49,49,108,111,103,105,99,95,101,114,114,111,114,0,83,116,49,50,108,101,110,103,116,104,95,101,114,114,111,114,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,57,95,95,112,111,105,110,116,101,114,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,112,98,97,115,101,95,116,121,112,101,95,105,110,102,111,69,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


   
  Module["_i64Subtract"] = _i64Subtract;

   
  Module["_i64Add"] = _i64Add;

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        if (info.refcount === 0) {
          if (info.destructor) {
            Runtime.dynCall('vi', info.destructor, [ptr]);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      EXCEPTIONS.clearRef(EXCEPTIONS.deAdjust(ptr)); // exception refcount should be cleared, but don't free it
      throw ptr;
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((asm["setTempRet0"](0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((asm["setTempRet0"](0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((asm["setTempRet0"](typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((asm["setTempRet0"](throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr;
    }

   
  Module["_memset"] = _memset;

   
  Module["_bitshift64Shl"] = _bitshift64Shl;

  function _abort() {
      Module['abort']();
    }

  
  
  function _free() {
  }
  Module["_free"] = _free;function ___cxa_free_exception(ptr) {
      try {
        return _free(ptr);
      } catch(e) { // XXX FIXME
        Module.printErr('exception during cxa_free_exception: ' + e);
      }
    }function ___cxa_end_catch() {
      if (___cxa_end_catch.rethrown) {
        ___cxa_end_catch.rethrown = false;
        return;
      }
      // Clear state flag.
      asm['setThrew'](0);
      // Call destructor if one is registered then clear it.
      var ptr = EXCEPTIONS.caught.pop();
      if (ptr) {
        EXCEPTIONS.decRef(EXCEPTIONS.deAdjust(ptr));
        EXCEPTIONS.last = 0; // XXX in decRef?
      }
    }


  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Runtime.dynCall('v', func);
      _pthread_once.seen[ptr] = 1;
    }

  function ___lock() {}

  function ___unlock() {}

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  
  function _malloc(bytes) {
      /* Over-allocate to make sure it is byte-aligned by 8.
       * This will leak memory, but this is only the dummy
       * implementation (replaced by dlmalloc normally) so
       * not an issue.
       */
      var ptr = Runtime.dynamicAlloc(bytes + 8);
      return (ptr+8) & 0xFFFFFFF8;
    }
  Module["_malloc"] = _malloc;function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

   
  Module["_bitshift64Lshr"] = _bitshift64Lshr;

  function _pthread_cleanup_push(routine, arg) {
      __ATEXIT__.push(function() { Runtime.dynCall('vi', routine, [arg]) })
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _pthread_cleanup_pop() {
      assert(_pthread_cleanup_push.level == __ATEXIT__.length, 'cannot pop if something else added meanwhile!');
      __ATEXIT__.pop();
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function ___cxa_find_matching_catch_2() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_find_matching_catch_3() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC); 
  Module["_llvm_cttz_i32"] = _llvm_cttz_i32; 
  Module["___udivmoddi4"] = ___udivmoddi4; 
  Module["___udivdi3"] = ___udivdi3;

  var _llvm_pow_f64=Math_pow;

  function ___cxa_call_unexpected(exception) {
      Module.printErr('Unexpected exception thrown, this is not properly supported - aborting');
      ABORT = true;
      throw exception;
    }

   
  Module["_memmove"] = _memmove;

  function ___gxx_personality_v0() {
    }

   
  Module["___uremdi3"] = ___uremdi3;

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
  Module["_sbrk"] = _sbrk;


   
  Module["_pthread_self"] = _pthread_self;

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
DYNAMICTOP_PTR = allocate(1, "i32", ALLOC_STATIC);

STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = Runtime.alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");



function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_i(x) { Module["printErr"]("Invalid function pointer called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_id(x) { Module["printErr"]("Invalid function pointer called with signature 'id'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_id(index,a1) {
  try {
    return Module["dynCall_id"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_iiii": nullFunc_iiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_i": nullFunc_i, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_viii": nullFunc_viii, "nullFunc_v": nullFunc_v, "nullFunc_viiiiii": nullFunc_viiiiii, "nullFunc_iii": nullFunc_iii, "nullFunc_id": nullFunc_id, "nullFunc_viiii": nullFunc_viiii, "invoke_iiii": invoke_iiii, "invoke_viiiii": invoke_viiiii, "invoke_i": invoke_i, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_viii": invoke_viii, "invoke_v": invoke_v, "invoke_viiiiii": invoke_viiiiii, "invoke_iii": invoke_iii, "invoke_id": invoke_id, "invoke_viiii": invoke_viiii, "_pthread_cleanup_pop": _pthread_cleanup_pop, "_pthread_getspecific": _pthread_getspecific, "_llvm_pow_f64": _llvm_pow_f64, "___syscall54": ___syscall54, "_abort": _abort, "___gxx_personality_v0": ___gxx_personality_v0, "___cxa_free_exception": ___cxa_free_exception, "___cxa_find_matching_catch_2": ___cxa_find_matching_catch_2, "___cxa_find_matching_catch_3": ___cxa_find_matching_catch_3, "___setErrNo": ___setErrNo, "___cxa_begin_catch": ___cxa_begin_catch, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___cxa_end_catch": ___cxa_end_catch, "___resumeException": ___resumeException, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_call_unexpected": ___cxa_call_unexpected, "_pthread_once": _pthread_once, "_pthread_key_create": _pthread_key_create, "___unlock": ___unlock, "_pthread_setspecific": _pthread_setspecific, "___cxa_throw": ___cxa_throw, "___lock": ___lock, "___syscall6": ___syscall6, "_pthread_cleanup_push": _pthread_cleanup_push, "___cxa_allocate_exception": ___cxa_allocate_exception, "___syscall140": ___syscall140, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___syscall146": ___syscall146, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';
  
  
  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);


  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_id=env.nullFunc_id;
  var nullFunc_viiii=env.nullFunc_viiii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_i=env.invoke_i;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_viii=env.invoke_viii;
  var invoke_v=env.invoke_v;
  var invoke_viiiiii=env.invoke_viiiiii;
  var invoke_iii=env.invoke_iii;
  var invoke_id=env.invoke_id;
  var invoke_viiii=env.invoke_viiii;
  var _pthread_cleanup_pop=env._pthread_cleanup_pop;
  var _pthread_getspecific=env._pthread_getspecific;
  var _llvm_pow_f64=env._llvm_pow_f64;
  var ___syscall54=env.___syscall54;
  var _abort=env._abort;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___cxa_free_exception=env.___cxa_free_exception;
  var ___cxa_find_matching_catch_2=env.___cxa_find_matching_catch_2;
  var ___cxa_find_matching_catch_3=env.___cxa_find_matching_catch_3;
  var ___setErrNo=env.___setErrNo;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var ___cxa_end_catch=env.___cxa_end_catch;
  var ___resumeException=env.___resumeException;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_call_unexpected=env.___cxa_call_unexpected;
  var _pthread_once=env._pthread_once;
  var _pthread_key_create=env._pthread_key_create;
  var ___unlock=env.___unlock;
  var _pthread_setspecific=env._pthread_setspecific;
  var ___cxa_throw=env.___cxa_throw;
  var ___lock=env.___lock;
  var ___syscall6=env.___syscall6;
  var _pthread_cleanup_push=env._pthread_cleanup_push;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var ___syscall140=env.___syscall140;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___syscall146=env.___syscall146;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __Z15print_formattedPiS_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$expand_i1_val = 0, $$expand_i1_val15 = 0, $$expand_i1_val17 = 0, $$expand_i1_val2 = 0, $$expand_i1_val21 = 0, $$expand_i1_val23 = 0, $$expand_i1_val31 = 0, $$expand_i1_val33 = 0, $$expand_i1_val37 = 0, $$expand_i1_val39 = 0, $$expand_i1_val47 = 0, $$expand_i1_val49 = 0, $$expand_i1_val5 = 0, $$expand_i1_val55 = 0, $$expand_i1_val57 = 0, $$expand_i1_val7 = 0, $$pre_trunc = 0, $$pre_trunc11 = 0, $$pre_trunc13 = 0, $$pre_trunc19 = 0;
 var $$pre_trunc25 = 0, $$pre_trunc27 = 0, $$pre_trunc29 = 0, $$pre_trunc35 = 0, $$pre_trunc41 = 0, $$pre_trunc43 = 0, $$pre_trunc45 = 0, $$pre_trunc51 = 0, $$pre_trunc53 = 0, $$pre_trunc59 = 0, $$pre_trunc61 = 0, $$pre_trunc9 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0;
 var $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0;
 var $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0;
 var $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0;
 var $1060 = 0, $1061 = 0, $1062 = 0, $1063 = 0, $1064 = 0, $1065 = 0, $1066 = 0, $1067 = 0, $1068 = 0, $1069 = 0, $107 = 0, $1070 = 0, $1071 = 0, $1072 = 0, $1073 = 0, $1074 = 0, $1075 = 0, $1076 = 0, $1077 = 0, $1078 = 0;
 var $1079 = 0, $108 = 0, $1080 = 0, $1081 = 0, $1082 = 0, $1083 = 0, $1084 = 0, $1085 = 0, $1086 = 0, $1087 = 0, $1088 = 0, $1089 = 0, $109 = 0, $1090 = 0, $1091 = 0, $1092 = 0, $1093 = 0, $1094 = 0, $1095 = 0, $1096 = 0;
 var $1097 = 0, $1098 = 0, $1099 = 0, $11 = 0, $110 = 0, $1100 = 0, $1101 = 0, $1102 = 0, $1103 = 0, $1104 = 0, $1105 = 0, $1106 = 0, $1107 = 0, $1108 = 0, $1109 = 0, $111 = 0, $1110 = 0, $1111 = 0, $1112 = 0, $1113 = 0;
 var $1114 = 0, $1115 = 0, $1116 = 0, $1117 = 0, $1118 = 0, $1119 = 0, $112 = 0, $1120 = 0, $1121 = 0, $1122 = 0, $1123 = 0, $1124 = 0, $1125 = 0, $1126 = 0, $1127 = 0, $1128 = 0, $1129 = 0, $113 = 0, $1130 = 0, $1131 = 0;
 var $1132 = 0, $1133 = 0, $1134 = 0, $1135 = 0, $1136 = 0, $1137 = 0, $1138 = 0, $1139 = 0, $114 = 0, $1140 = 0, $1141 = 0, $1142 = 0, $1143 = 0, $1144 = 0, $1145 = 0, $1146 = 0, $1147 = 0, $1148 = 0, $1149 = 0, $115 = 0;
 var $1150 = 0, $1151 = 0, $1152 = 0, $1153 = 0, $1154 = 0, $1155 = 0, $1156 = 0, $1157 = 0, $1158 = 0, $1159 = 0, $116 = 0, $1160 = 0, $1161 = 0, $1162 = 0, $1163 = 0, $1164 = 0, $1165 = 0, $1166 = 0, $1167 = 0, $1168 = 0;
 var $1169 = 0, $117 = 0, $1170 = 0, $1171 = 0, $1172 = 0, $1173 = 0, $1174 = 0, $1175 = 0, $1176 = 0, $1177 = 0, $1178 = 0, $1179 = 0, $118 = 0, $1180 = 0, $1181 = 0, $1182 = 0, $1183 = 0, $1184 = 0, $1185 = 0, $1186 = 0;
 var $1187 = 0, $1188 = 0, $1189 = 0, $119 = 0, $1190 = 0, $1191 = 0, $1192 = 0, $1193 = 0, $1194 = 0, $1195 = 0, $1196 = 0, $1197 = 0, $1198 = 0, $1199 = 0, $12 = 0, $120 = 0, $1200 = 0, $1201 = 0, $1202 = 0, $1203 = 0;
 var $1204 = 0, $1205 = 0, $1206 = 0, $1207 = 0, $1208 = 0, $1209 = 0, $121 = 0, $1210 = 0, $1211 = 0, $1212 = 0, $1213 = 0, $1214 = 0, $1215 = 0, $1216 = 0, $1217 = 0, $1218 = 0, $1219 = 0, $122 = 0, $1220 = 0, $1221 = 0;
 var $1222 = 0, $1223 = 0, $1224 = 0, $1225 = 0, $1226 = 0, $1227 = 0, $1228 = 0, $1229 = 0, $123 = 0, $1230 = 0, $1231 = 0, $1232 = 0, $1233 = 0, $1234 = 0, $1235 = 0, $1236 = 0, $1237 = 0, $1238 = 0, $1239 = 0, $124 = 0;
 var $1240 = 0, $1241 = 0, $1242 = 0, $1243 = 0, $1244 = 0, $1245 = 0, $1246 = 0, $1247 = 0, $1248 = 0, $1249 = 0, $125 = 0, $1250 = 0, $1251 = 0, $1252 = 0, $1253 = 0, $1254 = 0, $1255 = 0, $1256 = 0, $1257 = 0, $1258 = 0;
 var $1259 = 0, $126 = 0, $1260 = 0, $1261 = 0, $1262 = 0, $1263 = 0, $1264 = 0, $1265 = 0, $1266 = 0, $1267 = 0, $1268 = 0, $1269 = 0, $127 = 0, $1270 = 0, $1271 = 0, $1272 = 0, $1273 = 0, $1274 = 0, $1275 = 0, $1276 = 0;
 var $1277 = 0, $1278 = 0, $1279 = 0, $128 = 0, $1280 = 0, $1281 = 0, $1282 = 0, $1283 = 0, $1284 = 0, $1285 = 0, $1286 = 0, $1287 = 0, $1288 = 0, $1289 = 0, $129 = 0, $1290 = 0, $1291 = 0, $1292 = 0, $1293 = 0, $1294 = 0;
 var $1295 = 0, $1296 = 0, $1297 = 0, $1298 = 0, $1299 = 0, $13 = 0, $130 = 0, $1300 = 0, $1301 = 0, $1302 = 0, $1303 = 0, $1304 = 0, $1305 = 0, $1306 = 0, $1307 = 0, $1308 = 0, $1309 = 0, $131 = 0, $1310 = 0, $1311 = 0;
 var $1312 = 0, $1313 = 0, $1314 = 0, $1315 = 0, $1316 = 0, $1317 = 0, $1318 = 0, $1319 = 0, $132 = 0, $1320 = 0, $1321 = 0, $1322 = 0, $1323 = 0, $1324 = 0, $1325 = 0, $1326 = 0, $1327 = 0, $1328 = 0, $1329 = 0, $133 = 0;
 var $1330 = 0, $1331 = 0, $1332 = 0, $1333 = 0, $1334 = 0, $1335 = 0, $1336 = 0, $1337 = 0, $1338 = 0, $1339 = 0, $134 = 0, $1340 = 0, $1341 = 0, $1342 = 0, $1343 = 0, $1344 = 0, $1345 = 0, $1346 = 0, $1347 = 0, $1348 = 0;
 var $1349 = 0, $135 = 0, $1350 = 0, $1351 = 0, $1352 = 0, $1353 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0;
 var $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0;
 var $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0;
 var $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0;
 var $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0;
 var $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0;
 var $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0;
 var $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0;
 var $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0;
 var $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0;
 var $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0;
 var $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0;
 var $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0;
 var $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0;
 var $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0;
 var $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0;
 var $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0;
 var $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0;
 var $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0;
 var $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0;
 var $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0;
 var $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0;
 var $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0;
 var $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0;
 var $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0;
 var $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0;
 var $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0;
 var $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0;
 var $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0;
 var $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0;
 var $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0;
 var $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0;
 var $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0;
 var $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0;
 var $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0;
 var $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0;
 var $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0;
 var $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0;
 var $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0;
 var $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0;
 var $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0;
 var $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0;
 var $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0;
 var $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0;
 var $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0;
 var $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0;
 var $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0;
 var $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0;
 var $997 = 0, $998 = 0, $999 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 1456|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(1456|0);
 $159 = sp + 820|0;
 $162 = sp + 808|0;
 $166 = sp + 792|0;
 $170 = sp + 776|0;
 $174 = sp + 760|0;
 $179 = sp + 740|0;
 $182 = sp + 728|0;
 $185 = sp + 716|0;
 $187 = sp + 708|0;
 $188 = sp + 704|0;
 $189 = sp + 700|0;
 $190 = sp + 696|0;
 $196 = sp + 672|0;
 $199 = sp + 660|0;
 $203 = sp + 644|0;
 $207 = sp + 628|0;
 $211 = sp + 612|0;
 $216 = sp + 592|0;
 $219 = sp + 580|0;
 $222 = sp + 568|0;
 $224 = sp + 560|0;
 $225 = sp + 556|0;
 $226 = sp + 552|0;
 $227 = sp + 548|0;
 $233 = sp + 504|0;
 $234 = sp + 480|0;
 $237 = sp + 456|0;
 $238 = sp + 444|0;
 $239 = sp + 432|0;
 $240 = sp + 420|0;
 $241 = sp + 408|0;
 $242 = sp + 404|0;
 $243 = sp + 392|0;
 $244 = sp + 380|0;
 $245 = sp + 376|0;
 $246 = sp + 364|0;
 $247 = sp + 352|0;
 $248 = sp + 1455|0;
 $249 = sp + 340|0;
 $250 = sp + 328|0;
 $251 = sp + 1454|0;
 $252 = sp + 316|0;
 $253 = sp + 304|0;
 $254 = sp + 300|0;
 $255 = sp + 288|0;
 $256 = sp + 276|0;
 $257 = sp + 1453|0;
 $258 = sp + 264|0;
 $259 = sp + 252|0;
 $260 = sp + 1452|0;
 $261 = sp + 240|0;
 $262 = sp + 228|0;
 $263 = sp + 224|0;
 $264 = sp + 212|0;
 $265 = sp + 200|0;
 $266 = sp + 1451|0;
 $267 = sp + 188|0;
 $268 = sp + 176|0;
 $269 = sp + 1450|0;
 $270 = sp + 164|0;
 $271 = sp + 152|0;
 $272 = sp + 148|0;
 $273 = sp + 136|0;
 $274 = sp + 124|0;
 $275 = sp + 1449|0;
 $276 = sp + 112|0;
 $277 = sp + 100|0;
 $278 = sp + 88|0;
 $279 = sp + 76|0;
 $280 = sp + 72|0;
 $281 = sp + 60|0;
 $282 = sp + 56|0;
 $283 = sp + 44|0;
 $284 = sp + 40|0;
 $285 = sp + 28|0;
 $286 = sp + 16|0;
 $287 = sp + 1448|0;
 $288 = sp + 4|0;
 $289 = sp;
 $230 = $1;
 $231 = $2;
 $229 = $233;
 $290 = $229;
 $228 = $290;
 $291 = $228;
 $223 = $291;
 $292 = $223;
 $220 = $222;
 $221 = -1;
 $293 = $220;
 HEAP32[$293>>2] = 0;
 $294 = HEAP32[$222>>2]|0;
 HEAP32[$224>>2] = $294;
 $200 = $224;
 HEAP32[$292>>2] = 0;
 $295 = ((($292)) + 4|0);
 $201 = $203;
 $202 = -1;
 $296 = $201;
 HEAP32[$296>>2] = 0;
 $297 = HEAP32[$203>>2]|0;
 HEAP32[$225>>2] = $297;
 $204 = $225;
 HEAP32[$295>>2] = 0;
 $298 = ((($292)) + 8|0);
 $205 = $207;
 $206 = -1;
 $299 = $205;
 HEAP32[$299>>2] = 0;
 $300 = HEAP32[$207>>2]|0;
 HEAP32[$226>>2] = $300;
 $208 = $226;
 HEAP32[$298>>2] = 0;
 $301 = ((($292)) + 12|0);
 $209 = $211;
 $210 = -1;
 $302 = $209;
 HEAP32[$302>>2] = 0;
 $303 = HEAP32[$211>>2]|0;
 HEAP32[$227>>2] = $303;
 $212 = $227;
 $218 = $301;
 HEAP32[$219>>2] = 0;
 $304 = $218;
 $217 = $219;
 $305 = $217;
 $306 = HEAP32[$305>>2]|0;
 $215 = $304;
 HEAP32[$216>>2] = $306;
 $307 = $215;
 $214 = $307;
 $213 = $216;
 $308 = $213;
 $309 = HEAP32[$308>>2]|0;
 HEAP32[$307>>2] = $309;
 $310 = ((($291)) + 16|0);
 HEAP32[$310>>2] = 0;
 $311 = ((($291)) + 20|0);
 $198 = $311;
 HEAP32[$199>>2] = 0;
 $312 = $198;
 $197 = $199;
 $313 = $197;
 $314 = HEAP32[$313>>2]|0;
 $195 = $312;
 HEAP32[$196>>2] = $314;
 $315 = $195;
 $194 = $315;
 $193 = $196;
 $316 = $193;
 $317 = HEAP32[$316>>2]|0;
 HEAP32[$315>>2] = $317;
 $192 = $234;
 $318 = $192;
 $191 = $318;
 $319 = $191;
 $186 = $319;
 $320 = $186;
 $183 = $185;
 $184 = -1;
 $321 = $183;
 HEAP32[$321>>2] = 0;
 $322 = HEAP32[$185>>2]|0;
 HEAP32[$187>>2] = $322;
 $163 = $187;
 HEAP32[$320>>2] = 0;
 $323 = ((($320)) + 4|0);
 $164 = $166;
 $165 = -1;
 $324 = $164;
 HEAP32[$324>>2] = 0;
 $325 = HEAP32[$166>>2]|0;
 HEAP32[$188>>2] = $325;
 $167 = $188;
 HEAP32[$323>>2] = 0;
 $326 = ((($320)) + 8|0);
 $168 = $170;
 $169 = -1;
 $327 = $168;
 HEAP32[$327>>2] = 0;
 $328 = HEAP32[$170>>2]|0;
 HEAP32[$189>>2] = $328;
 $171 = $189;
 HEAP32[$326>>2] = 0;
 $329 = ((($320)) + 12|0);
 $172 = $174;
 $173 = -1;
 $330 = $172;
 HEAP32[$330>>2] = 0;
 $331 = HEAP32[$174>>2]|0;
 HEAP32[$190>>2] = $331;
 $175 = $190;
 $181 = $329;
 HEAP32[$182>>2] = 0;
 $332 = $181;
 $180 = $182;
 $333 = $180;
 $334 = HEAP32[$333>>2]|0;
 $178 = $332;
 HEAP32[$179>>2] = $334;
 $335 = $178;
 $177 = $335;
 $176 = $179;
 $336 = $176;
 $337 = HEAP32[$336>>2]|0;
 HEAP32[$335>>2] = $337;
 $338 = ((($319)) + 16|0);
 HEAP32[$338>>2] = 0;
 $339 = ((($319)) + 20|0);
 $161 = $339;
 HEAP32[$162>>2] = 0;
 $340 = $161;
 $160 = $162;
 $341 = $160;
 $342 = HEAP32[$341>>2]|0;
 $158 = $340;
 HEAP32[$159>>2] = $342;
 $343 = $158;
 $157 = $343;
 $156 = $159;
 $344 = $156;
 $345 = HEAP32[$344>>2]|0;
 HEAP32[$343>>2] = $345;
 $155 = $237;
 $346 = $155;
 $154 = $346;
 $347 = $154;
 $153 = $347;
 $348 = $153;
 $152 = $348;
 ;HEAP32[$348>>2]=0|0;HEAP32[$348+4>>2]=0|0;HEAP32[$348+8>>2]=0|0;
 $149 = $346;
 $349 = $149;
 $148 = $349;
 $350 = $148;
 $147 = $350;
 $351 = $147;
 $150 = $351;
 $151 = 0;
 while(1) {
  $352 = $151;
  $353 = ($352>>>0)<(3);
  if (!($353)) {
   break;
  }
  $354 = $151;
  $355 = $150;
  $356 = (($355) + ($354<<2)|0);
  HEAP32[$356>>2] = 0;
  $357 = $151;
  $358 = (($357) + 1)|0;
  $151 = $358;
 }
 $146 = $238;
 $359 = $146;
 $145 = $359;
 $360 = $145;
 $144 = $360;
 $361 = $144;
 $143 = $361;
 ;HEAP32[$361>>2]=0|0;HEAP32[$361+4>>2]=0|0;HEAP32[$361+8>>2]=0|0;
 $140 = $359;
 $362 = $140;
 $139 = $362;
 $363 = $139;
 $138 = $363;
 $364 = $138;
 $141 = $364;
 $142 = 0;
 while(1) {
  $365 = $142;
  $366 = ($365>>>0)<(3);
  if (!($366)) {
   break;
  }
  $367 = $142;
  $368 = $141;
  $369 = (($368) + ($367<<2)|0);
  HEAP32[$369>>2] = 0;
  $370 = $142;
  $371 = (($370) + 1)|0;
  $142 = $371;
 }
 $137 = $239;
 $372 = $137;
 $136 = $372;
 $373 = $136;
 $135 = $373;
 $374 = $135;
 $134 = $374;
 ;HEAP32[$374>>2]=0|0;HEAP32[$374+4>>2]=0|0;HEAP32[$374+8>>2]=0|0;
 $131 = $372;
 $375 = $131;
 $130 = $375;
 $376 = $130;
 $129 = $376;
 $377 = $129;
 $132 = $377;
 $133 = 0;
 while(1) {
  $378 = $133;
  $379 = ($378>>>0)<(3);
  if (!($379)) {
   break;
  }
  $380 = $133;
  $381 = $132;
  $382 = (($381) + ($380<<2)|0);
  HEAP32[$382>>2] = 0;
  $383 = $133;
  $384 = (($383) + 1)|0;
  $133 = $384;
 }
 $232 = 0;
 L13: while(1) {
  $385 = $232;
  $386 = ($385|0)<(7);
  if (!($386)) {
   label = 231;
   break;
  }
  $387 = $232;
  $388 = $230;
  $389 = (($388) + ($387<<2)|0);
  $390 = HEAP32[$389>>2]|0;
  switch ($390|0) {
  case 10:  {
   $126 = $234;
   $127 = 1;
   $399 = $126;
   $400 = ((($399)) + 16|0);
   $401 = HEAP32[$400>>2]|0;
   $402 = $127;
   $403 = (($401) + ($402))|0;
   $128 = $403;
   $125 = $399;
   $404 = $125;
   $405 = ((($404)) + 4|0);
   $406 = HEAP32[$405>>2]|0;
   $407 = $128;
   $408 = (($407>>>0) / 341)&-1;
   $409 = (($406) + ($408<<2)|0);
   $410 = HEAP32[$409>>2]|0;
   $411 = $128;
   $412 = (($411>>>0) % 341)&-1;
   $413 = (($410) + (($412*12)|0)|0);
   __THREW__ = 0;
   invoke_viii(26,($241|0),($413|0),(646|0));
   $414 = __THREW__; __THREW__ = 0;
   $415 = $414&1;
   if ($415) {
    label = 28;
    break L13;
   }
   $120 = $234;
   $121 = 0;
   $416 = $120;
   $417 = ((($416)) + 16|0);
   $418 = HEAP32[$417>>2]|0;
   $419 = $121;
   $420 = (($418) + ($419))|0;
   $122 = $420;
   $119 = $416;
   $421 = $119;
   $422 = ((($421)) + 4|0);
   $423 = HEAP32[$422>>2]|0;
   $424 = $122;
   $425 = (($424>>>0) / 341)&-1;
   $426 = (($423) + ($425<<2)|0);
   $427 = HEAP32[$426>>2]|0;
   $428 = $122;
   $429 = (($428>>>0) % 341)&-1;
   $430 = (($427) + (($429*12)|0)|0);
   __THREW__ = 0;
   invoke_viii(27,($240|0),($241|0),($430|0));
   $431 = __THREW__; __THREW__ = 0;
   $432 = $431&1;
   if ($432) {
    label = 29;
    break L13;
   }
   __THREW__ = 0;
   (invoke_iii(28,($237|0),($240|0))|0);
   $433 = __THREW__; __THREW__ = 0;
   $434 = $433&1;
   if ($434) {
    label = 30;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($240|0));
   $435 = __THREW__; __THREW__ = 0;
   $436 = $435&1;
   if ($436) {
    label = 29;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($241|0));
   $437 = __THREW__; __THREW__ = 0;
   $438 = $437&1;
   if ($438) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $439 = __THREW__; __THREW__ = 0;
   $440 = $439&1;
   if ($440) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $441 = __THREW__; __THREW__ = 0;
   $442 = $441&1;
   if ($442) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($237|0));
   $443 = __THREW__; __THREW__ = 0;
   $444 = $443&1;
   if ($444) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $445 = __THREW__; __THREW__ = 0;
   $446 = $445&1;
   if ($446) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $447 = __THREW__; __THREW__ = 0;
   $448 = $447&1;
   if ($448) {
    label = 28;
    break L13;
   }
   HEAP32[$242>>2] = 1;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($242|0));
   $449 = __THREW__; __THREW__ = 0;
   $450 = $449&1;
   if ($450) {
    label = 28;
    break L13;
   }
   break;
  }
  case 11:  {
   $116 = $234;
   $117 = 1;
   $461 = $116;
   $462 = ((($461)) + 16|0);
   $463 = HEAP32[$462>>2]|0;
   $464 = $117;
   $465 = (($463) + ($464))|0;
   $118 = $465;
   $115 = $461;
   $466 = $115;
   $467 = ((($466)) + 4|0);
   $468 = HEAP32[$467>>2]|0;
   $469 = $118;
   $470 = (($469>>>0) / 341)&-1;
   $471 = (($468) + ($470<<2)|0);
   $472 = HEAP32[$471>>2]|0;
   $473 = $118;
   $474 = (($473>>>0) % 341)&-1;
   $475 = (($472) + (($474*12)|0)|0);
   __THREW__ = 0;
   invoke_viii(26,($244|0),($475|0),(650|0));
   $476 = __THREW__; __THREW__ = 0;
   $477 = $476&1;
   if ($477) {
    label = 28;
    break L13;
   }
   $112 = $234;
   $113 = 0;
   $478 = $112;
   $479 = ((($478)) + 16|0);
   $480 = HEAP32[$479>>2]|0;
   $481 = $113;
   $482 = (($480) + ($481))|0;
   $114 = $482;
   $111 = $478;
   $483 = $111;
   $484 = ((($483)) + 4|0);
   $485 = HEAP32[$484>>2]|0;
   $486 = $114;
   $487 = (($486>>>0) / 341)&-1;
   $488 = (($485) + ($487<<2)|0);
   $489 = HEAP32[$488>>2]|0;
   $490 = $114;
   $491 = (($490>>>0) % 341)&-1;
   $492 = (($489) + (($491*12)|0)|0);
   __THREW__ = 0;
   invoke_viii(27,($243|0),($244|0),($492|0));
   $493 = __THREW__; __THREW__ = 0;
   $494 = $493&1;
   if ($494) {
    label = 43;
    break L13;
   }
   __THREW__ = 0;
   (invoke_iii(28,($237|0),($243|0))|0);
   $495 = __THREW__; __THREW__ = 0;
   $496 = $495&1;
   if ($496) {
    label = 44;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($243|0));
   $497 = __THREW__; __THREW__ = 0;
   $498 = $497&1;
   if ($498) {
    label = 43;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($244|0));
   $499 = __THREW__; __THREW__ = 0;
   $500 = $499&1;
   if ($500) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $501 = __THREW__; __THREW__ = 0;
   $502 = $501&1;
   if ($502) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $503 = __THREW__; __THREW__ = 0;
   $504 = $503&1;
   if ($504) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($237|0));
   $505 = __THREW__; __THREW__ = 0;
   $506 = $505&1;
   if ($506) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $507 = __THREW__; __THREW__ = 0;
   $508 = $507&1;
   if ($508) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $509 = __THREW__; __THREW__ = 0;
   $510 = $509&1;
   if ($510) {
    label = 28;
    break L13;
   }
   HEAP32[$245>>2] = 1;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($245|0));
   $511 = __THREW__; __THREW__ = 0;
   $512 = $511&1;
   if ($512) {
    label = 28;
    break L13;
   }
   break;
  }
  case 12:  {
   $$expand_i1_val = 0;
   HEAP8[$248>>0] = $$expand_i1_val;
   $108 = $233;
   $109 = 1;
   $521 = $108;
   $522 = ((($521)) + 16|0);
   $523 = HEAP32[$522>>2]|0;
   $524 = $109;
   $525 = (($523) + ($524))|0;
   $110 = $525;
   $107 = $521;
   $526 = $107;
   $527 = ((($526)) + 4|0);
   $528 = HEAP32[$527>>2]|0;
   $529 = $110;
   $530 = (($529>>>0) / 1024)&-1;
   $531 = (($528) + ($530<<2)|0);
   $532 = HEAP32[$531>>2]|0;
   $533 = $110;
   $534 = (($533>>>0) % 1024)&-1;
   $535 = (($532) + ($534<<2)|0);
   $536 = HEAP32[$535>>2]|0;
   $537 = ($536|0)<(2);
   if ($537) {
    $104 = $234;
    $105 = 1;
    $538 = $104;
    $539 = ((($538)) + 16|0);
    $540 = HEAP32[$539>>2]|0;
    $541 = $105;
    $542 = (($540) + ($541))|0;
    $106 = $542;
    $103 = $538;
    $543 = $103;
    $544 = ((($543)) + 4|0);
    $545 = HEAP32[$544>>2]|0;
    $546 = $106;
    $547 = (($546>>>0) / 341)&-1;
    $548 = (($545) + ($547<<2)|0);
    $549 = HEAP32[$548>>2]|0;
    $550 = $106;
    $551 = (($550>>>0) % 341)&-1;
    $552 = (($549) + (($551*12)|0)|0);
    __THREW__ = 0;
    invoke_viii(34,($247|0),(654|0),($552|0));
    $553 = __THREW__; __THREW__ = 0;
    $554 = $553&1;
    if ($554) {
     label = 28;
     break L13;
    }
    $$expand_i1_val2 = 1;
    HEAP8[$248>>0] = $$expand_i1_val2;
    __THREW__ = 0;
    invoke_viii(26,($246|0),($247|0),(656|0));
    $555 = __THREW__; __THREW__ = 0;
    $556 = $555&1;
    if ($556) {
     label = 73;
     break L13;
    }
   } else {
    $96 = $234;
    $97 = 1;
    $557 = $96;
    $558 = ((($557)) + 16|0);
    $559 = HEAP32[$558>>2]|0;
    $560 = $97;
    $561 = (($559) + ($560))|0;
    $98 = $561;
    $95 = $557;
    $562 = $95;
    $563 = ((($562)) + 4|0);
    $564 = HEAP32[$563>>2]|0;
    $565 = $98;
    $566 = (($565>>>0) / 341)&-1;
    $567 = (($564) + ($566<<2)|0);
    $568 = HEAP32[$567>>2]|0;
    $569 = $98;
    $570 = (($569>>>0) % 341)&-1;
    $571 = (($568) + (($570*12)|0)|0);
    __THREW__ = 0;
    invoke_vii(35,($246|0),($571|0));
    $572 = __THREW__; __THREW__ = 0;
    $573 = $572&1;
    if ($573) {
     label = 73;
     break L13;
    }
   }
   __THREW__ = 0;
   (invoke_iii(28,($238|0),($246|0))|0);
   $574 = __THREW__; __THREW__ = 0;
   $575 = $574&1;
   if ($575) {
    label = 74;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($246|0));
   $576 = __THREW__; __THREW__ = 0;
   $577 = $576&1;
   if ($577) {
    label = 73;
    break L13;
   }
   $$pre_trunc = HEAP8[$248>>0]|0;
   $578 = $$pre_trunc&1;
   if ($578) {
    __THREW__ = 0;
    invoke_vi(29,($247|0));
    $579 = __THREW__; __THREW__ = 0;
    $580 = $579&1;
    if ($580) {
     label = 28;
     break L13;
    }
   }
   $$expand_i1_val5 = 0;
   HEAP8[$251>>0] = $$expand_i1_val5;
   $92 = $233;
   $93 = 0;
   $581 = $92;
   $582 = ((($581)) + 16|0);
   $583 = HEAP32[$582>>2]|0;
   $584 = $93;
   $585 = (($583) + ($584))|0;
   $94 = $585;
   $91 = $581;
   $586 = $91;
   $587 = ((($586)) + 4|0);
   $588 = HEAP32[$587>>2]|0;
   $589 = $94;
   $590 = (($589>>>0) / 1024)&-1;
   $591 = (($588) + ($590<<2)|0);
   $592 = HEAP32[$591>>2]|0;
   $593 = $94;
   $594 = (($593>>>0) % 1024)&-1;
   $595 = (($592) + ($594<<2)|0);
   $596 = HEAP32[$595>>2]|0;
   $597 = ($596|0)<(2);
   if ($597) {
    $80 = $234;
    $81 = 0;
    $598 = $80;
    $599 = ((($598)) + 16|0);
    $600 = HEAP32[$599>>2]|0;
    $601 = $81;
    $602 = (($600) + ($601))|0;
    $82 = $602;
    $79 = $598;
    $603 = $79;
    $604 = ((($603)) + 4|0);
    $605 = HEAP32[$604>>2]|0;
    $606 = $82;
    $607 = (($606>>>0) / 341)&-1;
    $608 = (($605) + ($607<<2)|0);
    $609 = HEAP32[$608>>2]|0;
    $610 = $82;
    $611 = (($610>>>0) % 341)&-1;
    $612 = (($609) + (($611*12)|0)|0);
    __THREW__ = 0;
    invoke_viii(34,($250|0),(654|0),($612|0));
    $613 = __THREW__; __THREW__ = 0;
    $614 = $613&1;
    if ($614) {
     label = 28;
     break L13;
    }
    $$expand_i1_val7 = 1;
    HEAP8[$251>>0] = $$expand_i1_val7;
    __THREW__ = 0;
    invoke_viii(26,($249|0),($250|0),(656|0));
    $615 = __THREW__; __THREW__ = 0;
    $616 = $615&1;
    if ($616) {
     label = 77;
     break L13;
    }
   } else {
    $76 = $234;
    $77 = 0;
    $617 = $76;
    $618 = ((($617)) + 16|0);
    $619 = HEAP32[$618>>2]|0;
    $620 = $77;
    $621 = (($619) + ($620))|0;
    $78 = $621;
    $75 = $617;
    $622 = $75;
    $623 = ((($622)) + 4|0);
    $624 = HEAP32[$623>>2]|0;
    $625 = $78;
    $626 = (($625>>>0) / 341)&-1;
    $627 = (($624) + ($626<<2)|0);
    $628 = HEAP32[$627>>2]|0;
    $629 = $78;
    $630 = (($629>>>0) % 341)&-1;
    $631 = (($628) + (($630*12)|0)|0);
    __THREW__ = 0;
    invoke_vii(35,($249|0),($631|0));
    $632 = __THREW__; __THREW__ = 0;
    $633 = $632&1;
    if ($633) {
     label = 77;
     break L13;
    }
   }
   __THREW__ = 0;
   (invoke_iii(28,($239|0),($249|0))|0);
   $634 = __THREW__; __THREW__ = 0;
   $635 = $634&1;
   if ($635) {
    label = 78;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($249|0));
   $636 = __THREW__; __THREW__ = 0;
   $637 = $636&1;
   if ($637) {
    label = 77;
    break L13;
   }
   $$pre_trunc9 = HEAP8[$251>>0]|0;
   $638 = $$pre_trunc9&1;
   if ($638) {
    __THREW__ = 0;
    invoke_vi(29,($250|0));
    $639 = __THREW__; __THREW__ = 0;
    $640 = $639&1;
    if ($640) {
     label = 28;
     break L13;
    }
   }
   __THREW__ = 0;
   invoke_viii(26,($253|0),($238|0),(658|0));
   $641 = __THREW__; __THREW__ = 0;
   $642 = $641&1;
   if ($642) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_viii(27,($252|0),($253|0),($239|0));
   $643 = __THREW__; __THREW__ = 0;
   $644 = $643&1;
   if ($644) {
    label = 81;
    break L13;
   }
   __THREW__ = 0;
   (invoke_iii(28,($237|0),($252|0))|0);
   $645 = __THREW__; __THREW__ = 0;
   $646 = $645&1;
   if ($646) {
    label = 82;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($252|0));
   $647 = __THREW__; __THREW__ = 0;
   $648 = $647&1;
   if ($648) {
    label = 81;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($253|0));
   $649 = __THREW__; __THREW__ = 0;
   $650 = $649&1;
   if ($650) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $651 = __THREW__; __THREW__ = 0;
   $652 = $651&1;
   if ($652) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $653 = __THREW__; __THREW__ = 0;
   $654 = $653&1;
   if ($654) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($237|0));
   $655 = __THREW__; __THREW__ = 0;
   $656 = $655&1;
   if ($656) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $657 = __THREW__; __THREW__ = 0;
   $658 = $657&1;
   if ($658) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $659 = __THREW__; __THREW__ = 0;
   $660 = $659&1;
   if ($660) {
    label = 28;
    break L13;
   }
   HEAP32[$254>>2] = 2;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($254|0));
   $661 = __THREW__; __THREW__ = 0;
   $662 = $661&1;
   if ($662) {
    label = 28;
    break L13;
   }
   break;
  }
  case 13:  {
   $$expand_i1_val15 = 0;
   HEAP8[$257>>0] = $$expand_i1_val15;
   $72 = $233;
   $73 = 1;
   $689 = $72;
   $690 = ((($689)) + 16|0);
   $691 = HEAP32[$690>>2]|0;
   $692 = $73;
   $693 = (($691) + ($692))|0;
   $74 = $693;
   $71 = $689;
   $694 = $71;
   $695 = ((($694)) + 4|0);
   $696 = HEAP32[$695>>2]|0;
   $697 = $74;
   $698 = (($697>>>0) / 1024)&-1;
   $699 = (($696) + ($698<<2)|0);
   $700 = HEAP32[$699>>2]|0;
   $701 = $74;
   $702 = (($701>>>0) % 1024)&-1;
   $703 = (($700) + ($702<<2)|0);
   $704 = HEAP32[$703>>2]|0;
   $705 = ($704|0)<(2);
   if ($705) {
    $68 = $234;
    $69 = 1;
    $706 = $68;
    $707 = ((($706)) + 16|0);
    $708 = HEAP32[$707>>2]|0;
    $709 = $69;
    $710 = (($708) + ($709))|0;
    $70 = $710;
    $67 = $706;
    $711 = $67;
    $712 = ((($711)) + 4|0);
    $713 = HEAP32[$712>>2]|0;
    $714 = $70;
    $715 = (($714>>>0) / 341)&-1;
    $716 = (($713) + ($715<<2)|0);
    $717 = HEAP32[$716>>2]|0;
    $718 = $70;
    $719 = (($718>>>0) % 341)&-1;
    $720 = (($717) + (($719*12)|0)|0);
    __THREW__ = 0;
    invoke_viii(34,($256|0),(654|0),($720|0));
    $721 = __THREW__; __THREW__ = 0;
    $722 = $721&1;
    if ($722) {
     label = 28;
     break L13;
    }
    $$expand_i1_val17 = 1;
    HEAP8[$257>>0] = $$expand_i1_val17;
    __THREW__ = 0;
    invoke_viii(26,($255|0),($256|0),(656|0));
    $723 = __THREW__; __THREW__ = 0;
    $724 = $723&1;
    if ($724) {
     label = 111;
     break L13;
    }
   } else {
    $64 = $234;
    $65 = 1;
    $725 = $64;
    $726 = ((($725)) + 16|0);
    $727 = HEAP32[$726>>2]|0;
    $728 = $65;
    $729 = (($727) + ($728))|0;
    $66 = $729;
    $63 = $725;
    $730 = $63;
    $731 = ((($730)) + 4|0);
    $732 = HEAP32[$731>>2]|0;
    $733 = $66;
    $734 = (($733>>>0) / 341)&-1;
    $735 = (($732) + ($734<<2)|0);
    $736 = HEAP32[$735>>2]|0;
    $737 = $66;
    $738 = (($737>>>0) % 341)&-1;
    $739 = (($736) + (($738*12)|0)|0);
    __THREW__ = 0;
    invoke_vii(35,($255|0),($739|0));
    $740 = __THREW__; __THREW__ = 0;
    $741 = $740&1;
    if ($741) {
     label = 111;
     break L13;
    }
   }
   __THREW__ = 0;
   (invoke_iii(28,($238|0),($255|0))|0);
   $742 = __THREW__; __THREW__ = 0;
   $743 = $742&1;
   if ($743) {
    label = 112;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($255|0));
   $744 = __THREW__; __THREW__ = 0;
   $745 = $744&1;
   if ($745) {
    label = 111;
    break L13;
   }
   $$pre_trunc19 = HEAP8[$257>>0]|0;
   $746 = $$pre_trunc19&1;
   if ($746) {
    __THREW__ = 0;
    invoke_vi(29,($256|0));
    $747 = __THREW__; __THREW__ = 0;
    $748 = $747&1;
    if ($748) {
     label = 28;
     break L13;
    }
   }
   $$expand_i1_val21 = 0;
   HEAP8[$260>>0] = $$expand_i1_val21;
   $60 = $233;
   $61 = 0;
   $749 = $60;
   $750 = ((($749)) + 16|0);
   $751 = HEAP32[$750>>2]|0;
   $752 = $61;
   $753 = (($751) + ($752))|0;
   $62 = $753;
   $59 = $749;
   $754 = $59;
   $755 = ((($754)) + 4|0);
   $756 = HEAP32[$755>>2]|0;
   $757 = $62;
   $758 = (($757>>>0) / 1024)&-1;
   $759 = (($756) + ($758<<2)|0);
   $760 = HEAP32[$759>>2]|0;
   $761 = $62;
   $762 = (($761>>>0) % 1024)&-1;
   $763 = (($760) + ($762<<2)|0);
   $764 = HEAP32[$763>>2]|0;
   $765 = ($764|0)<(2);
   if ($765) {
    $56 = $234;
    $57 = 0;
    $766 = $56;
    $767 = ((($766)) + 16|0);
    $768 = HEAP32[$767>>2]|0;
    $769 = $57;
    $770 = (($768) + ($769))|0;
    $58 = $770;
    $55 = $766;
    $771 = $55;
    $772 = ((($771)) + 4|0);
    $773 = HEAP32[$772>>2]|0;
    $774 = $58;
    $775 = (($774>>>0) / 341)&-1;
    $776 = (($773) + ($775<<2)|0);
    $777 = HEAP32[$776>>2]|0;
    $778 = $58;
    $779 = (($778>>>0) % 341)&-1;
    $780 = (($777) + (($779*12)|0)|0);
    __THREW__ = 0;
    invoke_viii(34,($259|0),(654|0),($780|0));
    $781 = __THREW__; __THREW__ = 0;
    $782 = $781&1;
    if ($782) {
     label = 28;
     break L13;
    }
    $$expand_i1_val23 = 1;
    HEAP8[$260>>0] = $$expand_i1_val23;
    __THREW__ = 0;
    invoke_viii(26,($258|0),($259|0),(656|0));
    $783 = __THREW__; __THREW__ = 0;
    $784 = $783&1;
    if ($784) {
     label = 115;
     break L13;
    }
   } else {
    $52 = $234;
    $53 = 0;
    $785 = $52;
    $786 = ((($785)) + 16|0);
    $787 = HEAP32[$786>>2]|0;
    $788 = $53;
    $789 = (($787) + ($788))|0;
    $54 = $789;
    $51 = $785;
    $790 = $51;
    $791 = ((($790)) + 4|0);
    $792 = HEAP32[$791>>2]|0;
    $793 = $54;
    $794 = (($793>>>0) / 341)&-1;
    $795 = (($792) + ($794<<2)|0);
    $796 = HEAP32[$795>>2]|0;
    $797 = $54;
    $798 = (($797>>>0) % 341)&-1;
    $799 = (($796) + (($798*12)|0)|0);
    __THREW__ = 0;
    invoke_vii(35,($258|0),($799|0));
    $800 = __THREW__; __THREW__ = 0;
    $801 = $800&1;
    if ($801) {
     label = 115;
     break L13;
    }
   }
   __THREW__ = 0;
   (invoke_iii(28,($239|0),($258|0))|0);
   $802 = __THREW__; __THREW__ = 0;
   $803 = $802&1;
   if ($803) {
    label = 116;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($258|0));
   $804 = __THREW__; __THREW__ = 0;
   $805 = $804&1;
   if ($805) {
    label = 115;
    break L13;
   }
   $$pre_trunc25 = HEAP8[$260>>0]|0;
   $806 = $$pre_trunc25&1;
   if ($806) {
    __THREW__ = 0;
    invoke_vi(29,($259|0));
    $807 = __THREW__; __THREW__ = 0;
    $808 = $807&1;
    if ($808) {
     label = 28;
     break L13;
    }
   }
   __THREW__ = 0;
   invoke_viii(26,($262|0),($238|0),(662|0));
   $809 = __THREW__; __THREW__ = 0;
   $810 = $809&1;
   if ($810) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_viii(27,($261|0),($262|0),($239|0));
   $811 = __THREW__; __THREW__ = 0;
   $812 = $811&1;
   if ($812) {
    label = 119;
    break L13;
   }
   __THREW__ = 0;
   (invoke_iii(28,($237|0),($261|0))|0);
   $813 = __THREW__; __THREW__ = 0;
   $814 = $813&1;
   if ($814) {
    label = 120;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($261|0));
   $815 = __THREW__; __THREW__ = 0;
   $816 = $815&1;
   if ($816) {
    label = 119;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($262|0));
   $817 = __THREW__; __THREW__ = 0;
   $818 = $817&1;
   if ($818) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $819 = __THREW__; __THREW__ = 0;
   $820 = $819&1;
   if ($820) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $821 = __THREW__; __THREW__ = 0;
   $822 = $821&1;
   if ($822) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($237|0));
   $823 = __THREW__; __THREW__ = 0;
   $824 = $823&1;
   if ($824) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $825 = __THREW__; __THREW__ = 0;
   $826 = $825&1;
   if ($826) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $827 = __THREW__; __THREW__ = 0;
   $828 = $827&1;
   if ($828) {
    label = 28;
    break L13;
   }
   HEAP32[$263>>2] = 2;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($263|0));
   $829 = __THREW__; __THREW__ = 0;
   $830 = $829&1;
   if ($830) {
    label = 28;
    break L13;
   }
   break;
  }
  case 14:  {
   $$expand_i1_val31 = 0;
   HEAP8[$266>>0] = $$expand_i1_val31;
   $48 = $233;
   $49 = 1;
   $857 = $48;
   $858 = ((($857)) + 16|0);
   $859 = HEAP32[$858>>2]|0;
   $860 = $49;
   $861 = (($859) + ($860))|0;
   $50 = $861;
   $47 = $857;
   $862 = $47;
   $863 = ((($862)) + 4|0);
   $864 = HEAP32[$863>>2]|0;
   $865 = $50;
   $866 = (($865>>>0) / 1024)&-1;
   $867 = (($864) + ($866<<2)|0);
   $868 = HEAP32[$867>>2]|0;
   $869 = $50;
   $870 = (($869>>>0) % 1024)&-1;
   $871 = (($868) + ($870<<2)|0);
   $872 = HEAP32[$871>>2]|0;
   $873 = ($872|0)<(4);
   if ($873) {
    $36 = $234;
    $37 = 1;
    $874 = $36;
    $875 = ((($874)) + 16|0);
    $876 = HEAP32[$875>>2]|0;
    $877 = $37;
    $878 = (($876) + ($877))|0;
    $38 = $878;
    $35 = $874;
    $879 = $35;
    $880 = ((($879)) + 4|0);
    $881 = HEAP32[$880>>2]|0;
    $882 = $38;
    $883 = (($882>>>0) / 341)&-1;
    $884 = (($881) + ($883<<2)|0);
    $885 = HEAP32[$884>>2]|0;
    $886 = $38;
    $887 = (($886>>>0) % 341)&-1;
    $888 = (($885) + (($887*12)|0)|0);
    __THREW__ = 0;
    invoke_viii(34,($265|0),(654|0),($888|0));
    $889 = __THREW__; __THREW__ = 0;
    $890 = $889&1;
    if ($890) {
     label = 28;
     break L13;
    }
    $$expand_i1_val33 = 1;
    HEAP8[$266>>0] = $$expand_i1_val33;
    __THREW__ = 0;
    invoke_viii(26,($264|0),($265|0),(656|0));
    $891 = __THREW__; __THREW__ = 0;
    $892 = $891&1;
    if ($892) {
     label = 149;
     break L13;
    }
   } else {
    $32 = $234;
    $33 = 1;
    $893 = $32;
    $894 = ((($893)) + 16|0);
    $895 = HEAP32[$894>>2]|0;
    $896 = $33;
    $897 = (($895) + ($896))|0;
    $34 = $897;
    $31 = $893;
    $898 = $31;
    $899 = ((($898)) + 4|0);
    $900 = HEAP32[$899>>2]|0;
    $901 = $34;
    $902 = (($901>>>0) / 341)&-1;
    $903 = (($900) + ($902<<2)|0);
    $904 = HEAP32[$903>>2]|0;
    $905 = $34;
    $906 = (($905>>>0) % 341)&-1;
    $907 = (($904) + (($906*12)|0)|0);
    __THREW__ = 0;
    invoke_vii(35,($264|0),($907|0));
    $908 = __THREW__; __THREW__ = 0;
    $909 = $908&1;
    if ($909) {
     label = 149;
     break L13;
    }
   }
   __THREW__ = 0;
   (invoke_iii(28,($238|0),($264|0))|0);
   $910 = __THREW__; __THREW__ = 0;
   $911 = $910&1;
   if ($911) {
    label = 150;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($264|0));
   $912 = __THREW__; __THREW__ = 0;
   $913 = $912&1;
   if ($913) {
    label = 149;
    break L13;
   }
   $$pre_trunc35 = HEAP8[$266>>0]|0;
   $914 = $$pre_trunc35&1;
   if ($914) {
    __THREW__ = 0;
    invoke_vi(29,($265|0));
    $915 = __THREW__; __THREW__ = 0;
    $916 = $915&1;
    if ($916) {
     label = 28;
     break L13;
    }
   }
   $$expand_i1_val37 = 0;
   HEAP8[$269>>0] = $$expand_i1_val37;
   $28 = $233;
   $29 = 0;
   $917 = $28;
   $918 = ((($917)) + 16|0);
   $919 = HEAP32[$918>>2]|0;
   $920 = $29;
   $921 = (($919) + ($920))|0;
   $30 = $921;
   $27 = $917;
   $922 = $27;
   $923 = ((($922)) + 4|0);
   $924 = HEAP32[$923>>2]|0;
   $925 = $30;
   $926 = (($925>>>0) / 1024)&-1;
   $927 = (($924) + ($926<<2)|0);
   $928 = HEAP32[$927>>2]|0;
   $929 = $30;
   $930 = (($929>>>0) % 1024)&-1;
   $931 = (($928) + ($930<<2)|0);
   $932 = HEAP32[$931>>2]|0;
   $933 = ($932|0)<(4);
   if ($933) {
    $24 = $234;
    $25 = 0;
    $934 = $24;
    $935 = ((($934)) + 16|0);
    $936 = HEAP32[$935>>2]|0;
    $937 = $25;
    $938 = (($936) + ($937))|0;
    $26 = $938;
    $23 = $934;
    $939 = $23;
    $940 = ((($939)) + 4|0);
    $941 = HEAP32[$940>>2]|0;
    $942 = $26;
    $943 = (($942>>>0) / 341)&-1;
    $944 = (($941) + ($943<<2)|0);
    $945 = HEAP32[$944>>2]|0;
    $946 = $26;
    $947 = (($946>>>0) % 341)&-1;
    $948 = (($945) + (($947*12)|0)|0);
    __THREW__ = 0;
    invoke_viii(34,($268|0),(654|0),($948|0));
    $949 = __THREW__; __THREW__ = 0;
    $950 = $949&1;
    if ($950) {
     label = 28;
     break L13;
    }
    $$expand_i1_val39 = 1;
    HEAP8[$269>>0] = $$expand_i1_val39;
    __THREW__ = 0;
    invoke_viii(26,($267|0),($268|0),(656|0));
    $951 = __THREW__; __THREW__ = 0;
    $952 = $951&1;
    if ($952) {
     label = 153;
     break L13;
    }
   } else {
    $20 = $234;
    $21 = 0;
    $953 = $20;
    $954 = ((($953)) + 16|0);
    $955 = HEAP32[$954>>2]|0;
    $956 = $21;
    $957 = (($955) + ($956))|0;
    $22 = $957;
    $19 = $953;
    $958 = $19;
    $959 = ((($958)) + 4|0);
    $960 = HEAP32[$959>>2]|0;
    $961 = $22;
    $962 = (($961>>>0) / 341)&-1;
    $963 = (($960) + ($962<<2)|0);
    $964 = HEAP32[$963>>2]|0;
    $965 = $22;
    $966 = (($965>>>0) % 341)&-1;
    $967 = (($964) + (($966*12)|0)|0);
    __THREW__ = 0;
    invoke_vii(35,($267|0),($967|0));
    $968 = __THREW__; __THREW__ = 0;
    $969 = $968&1;
    if ($969) {
     label = 153;
     break L13;
    }
   }
   __THREW__ = 0;
   (invoke_iii(28,($239|0),($267|0))|0);
   $970 = __THREW__; __THREW__ = 0;
   $971 = $970&1;
   if ($971) {
    label = 154;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($267|0));
   $972 = __THREW__; __THREW__ = 0;
   $973 = $972&1;
   if ($973) {
    label = 153;
    break L13;
   }
   $$pre_trunc41 = HEAP8[$269>>0]|0;
   $974 = $$pre_trunc41&1;
   if ($974) {
    __THREW__ = 0;
    invoke_vi(29,($268|0));
    $975 = __THREW__; __THREW__ = 0;
    $976 = $975&1;
    if ($976) {
     label = 28;
     break L13;
    }
   }
   __THREW__ = 0;
   invoke_viii(26,($271|0),($238|0),(666|0));
   $977 = __THREW__; __THREW__ = 0;
   $978 = $977&1;
   if ($978) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_viii(27,($270|0),($271|0),($239|0));
   $979 = __THREW__; __THREW__ = 0;
   $980 = $979&1;
   if ($980) {
    label = 157;
    break L13;
   }
   __THREW__ = 0;
   (invoke_iii(28,($237|0),($270|0))|0);
   $981 = __THREW__; __THREW__ = 0;
   $982 = $981&1;
   if ($982) {
    label = 158;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($270|0));
   $983 = __THREW__; __THREW__ = 0;
   $984 = $983&1;
   if ($984) {
    label = 157;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($271|0));
   $985 = __THREW__; __THREW__ = 0;
   $986 = $985&1;
   if ($986) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $987 = __THREW__; __THREW__ = 0;
   $988 = $987&1;
   if ($988) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $989 = __THREW__; __THREW__ = 0;
   $990 = $989&1;
   if ($990) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($237|0));
   $991 = __THREW__; __THREW__ = 0;
   $992 = $991&1;
   if ($992) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $993 = __THREW__; __THREW__ = 0;
   $994 = $993&1;
   if ($994) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $995 = __THREW__; __THREW__ = 0;
   $996 = $995&1;
   if ($996) {
    label = 28;
    break L13;
   }
   HEAP32[$272>>2] = 3;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($272|0));
   $997 = __THREW__; __THREW__ = 0;
   $998 = $997&1;
   if ($998) {
    label = 28;
    break L13;
   }
   break;
  }
  case 15:  {
   $16 = $234;
   $17 = 1;
   $1025 = $16;
   $1026 = ((($1025)) + 16|0);
   $1027 = HEAP32[$1026>>2]|0;
   $1028 = $17;
   $1029 = (($1027) + ($1028))|0;
   $18 = $1029;
   $15 = $1025;
   $1030 = $15;
   $1031 = ((($1030)) + 4|0);
   $1032 = HEAP32[$1031>>2]|0;
   $1033 = $18;
   $1034 = (($1033>>>0) / 341)&-1;
   $1035 = (($1032) + ($1034<<2)|0);
   $1036 = HEAP32[$1035>>2]|0;
   $1037 = $18;
   $1038 = (($1037>>>0) % 341)&-1;
   $1039 = (($1036) + (($1038*12)|0)|0);
   __THREW__ = 0;
   (invoke_iii(28,($238|0),($1039|0))|0);
   $1040 = __THREW__; __THREW__ = 0;
   $1041 = $1040&1;
   if ($1041) {
    label = 28;
    break L13;
   }
   $$expand_i1_val47 = 0;
   HEAP8[$275>>0] = $$expand_i1_val47;
   $12 = $233;
   $13 = 0;
   $1042 = $12;
   $1043 = ((($1042)) + 16|0);
   $1044 = HEAP32[$1043>>2]|0;
   $1045 = $13;
   $1046 = (($1044) + ($1045))|0;
   $14 = $1046;
   $11 = $1042;
   $1047 = $11;
   $1048 = ((($1047)) + 4|0);
   $1049 = HEAP32[$1048>>2]|0;
   $1050 = $14;
   $1051 = (($1050>>>0) / 1024)&-1;
   $1052 = (($1049) + ($1051<<2)|0);
   $1053 = HEAP32[$1052>>2]|0;
   $1054 = $14;
   $1055 = (($1054>>>0) % 1024)&-1;
   $1056 = (($1053) + ($1055<<2)|0);
   $1057 = HEAP32[$1056>>2]|0;
   $1058 = ($1057|0)<(4);
   if ($1058) {
    $8 = $234;
    $9 = 0;
    $1059 = $8;
    $1060 = ((($1059)) + 16|0);
    $1061 = HEAP32[$1060>>2]|0;
    $1062 = $9;
    $1063 = (($1061) + ($1062))|0;
    $10 = $1063;
    $7 = $1059;
    $1064 = $7;
    $1065 = ((($1064)) + 4|0);
    $1066 = HEAP32[$1065>>2]|0;
    $1067 = $10;
    $1068 = (($1067>>>0) / 341)&-1;
    $1069 = (($1066) + ($1068<<2)|0);
    $1070 = HEAP32[$1069>>2]|0;
    $1071 = $10;
    $1072 = (($1071>>>0) % 341)&-1;
    $1073 = (($1070) + (($1072*12)|0)|0);
    __THREW__ = 0;
    invoke_viii(34,($274|0),(654|0),($1073|0));
    $1074 = __THREW__; __THREW__ = 0;
    $1075 = $1074&1;
    if ($1075) {
     label = 28;
     break L13;
    }
    $$expand_i1_val49 = 1;
    HEAP8[$275>>0] = $$expand_i1_val49;
    __THREW__ = 0;
    invoke_viii(26,($273|0),($274|0),(656|0));
    $1076 = __THREW__; __THREW__ = 0;
    $1077 = $1076&1;
    if ($1077) {
     label = 184;
     break L13;
    }
   } else {
    $4 = $234;
    $5 = 0;
    $1078 = $4;
    $1079 = ((($1078)) + 16|0);
    $1080 = HEAP32[$1079>>2]|0;
    $1081 = $5;
    $1082 = (($1080) + ($1081))|0;
    $6 = $1082;
    $3 = $1078;
    $1083 = $3;
    $1084 = ((($1083)) + 4|0);
    $1085 = HEAP32[$1084>>2]|0;
    $1086 = $6;
    $1087 = (($1086>>>0) / 341)&-1;
    $1088 = (($1085) + ($1087<<2)|0);
    $1089 = HEAP32[$1088>>2]|0;
    $1090 = $6;
    $1091 = (($1090>>>0) % 341)&-1;
    $1092 = (($1089) + (($1091*12)|0)|0);
    __THREW__ = 0;
    invoke_vii(35,($273|0),($1092|0));
    $1093 = __THREW__; __THREW__ = 0;
    $1094 = $1093&1;
    if ($1094) {
     label = 184;
     break L13;
    }
   }
   __THREW__ = 0;
   (invoke_iii(28,($239|0),($273|0))|0);
   $1095 = __THREW__; __THREW__ = 0;
   $1096 = $1095&1;
   if ($1096) {
    label = 185;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($273|0));
   $1097 = __THREW__; __THREW__ = 0;
   $1098 = $1097&1;
   if ($1098) {
    label = 184;
    break L13;
   }
   $$pre_trunc51 = HEAP8[$275>>0]|0;
   $1099 = $$pre_trunc51&1;
   if ($1099) {
    __THREW__ = 0;
    invoke_vi(29,($274|0));
    $1100 = __THREW__; __THREW__ = 0;
    $1101 = $1100&1;
    if ($1101) {
     label = 28;
     break L13;
    }
   }
   __THREW__ = 0;
   invoke_viii(34,($279|0),(668|0),($239|0));
   $1102 = __THREW__; __THREW__ = 0;
   $1103 = $1102&1;
   if ($1103) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_viii(26,($278|0),($279|0),(654|0));
   $1104 = __THREW__; __THREW__ = 0;
   $1105 = $1104&1;
   if ($1105) {
    label = 188;
    break L13;
   }
   __THREW__ = 0;
   invoke_viii(27,($277|0),($278|0),($238|0));
   $1106 = __THREW__; __THREW__ = 0;
   $1107 = $1106&1;
   if ($1107) {
    label = 189;
    break L13;
   }
   __THREW__ = 0;
   invoke_viii(26,($276|0),($277|0),(656|0));
   $1108 = __THREW__; __THREW__ = 0;
   $1109 = $1108&1;
   if ($1109) {
    label = 190;
    break L13;
   }
   __THREW__ = 0;
   (invoke_iii(28,($237|0),($276|0))|0);
   $1110 = __THREW__; __THREW__ = 0;
   $1111 = $1110&1;
   if ($1111) {
    label = 191;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($276|0));
   $1112 = __THREW__; __THREW__ = 0;
   $1113 = $1112&1;
   if ($1113) {
    label = 190;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($277|0));
   $1114 = __THREW__; __THREW__ = 0;
   $1115 = $1114&1;
   if ($1115) {
    label = 189;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($278|0));
   $1116 = __THREW__; __THREW__ = 0;
   $1117 = $1116&1;
   if ($1117) {
    label = 188;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($279|0));
   $1118 = __THREW__; __THREW__ = 0;
   $1119 = $1118&1;
   if ($1119) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $1120 = __THREW__; __THREW__ = 0;
   $1121 = $1120&1;
   if ($1121) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $1122 = __THREW__; __THREW__ = 0;
   $1123 = $1122&1;
   if ($1123) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($237|0));
   $1124 = __THREW__; __THREW__ = 0;
   $1125 = $1124&1;
   if ($1125) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $1126 = __THREW__; __THREW__ = 0;
   $1127 = $1126&1;
   if ($1127) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $1128 = __THREW__; __THREW__ = 0;
   $1129 = $1128&1;
   if ($1129) {
    label = 28;
    break L13;
   }
   HEAP32[$280>>2] = 3;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($280|0));
   $1130 = __THREW__; __THREW__ = 0;
   $1131 = $1130&1;
   if ($1131) {
    label = 28;
    break L13;
   }
   break;
  }
  case 16:  {
   $40 = $234;
   $41 = 1;
   $1157 = $40;
   $1158 = ((($1157)) + 16|0);
   $1159 = HEAP32[$1158>>2]|0;
   $1160 = $41;
   $1161 = (($1159) + ($1160))|0;
   $42 = $1161;
   $39 = $1157;
   $1162 = $39;
   $1163 = ((($1162)) + 4|0);
   $1164 = HEAP32[$1163>>2]|0;
   $1165 = $42;
   $1166 = (($1165>>>0) / 341)&-1;
   $1167 = (($1164) + ($1166<<2)|0);
   $1168 = HEAP32[$1167>>2]|0;
   $1169 = $42;
   $1170 = (($1169>>>0) % 341)&-1;
   $1171 = (($1168) + (($1170*12)|0)|0);
   $44 = $234;
   $45 = 0;
   $1172 = $44;
   $1173 = ((($1172)) + 16|0);
   $1174 = HEAP32[$1173>>2]|0;
   $1175 = $45;
   $1176 = (($1174) + ($1175))|0;
   $46 = $1176;
   $43 = $1172;
   $1177 = $43;
   $1178 = ((($1177)) + 4|0);
   $1179 = HEAP32[$1178>>2]|0;
   $1180 = $46;
   $1181 = (($1180>>>0) / 341)&-1;
   $1182 = (($1179) + ($1181<<2)|0);
   $1183 = HEAP32[$1182>>2]|0;
   $1184 = $46;
   $1185 = (($1184>>>0) % 341)&-1;
   $1186 = (($1183) + (($1185*12)|0)|0);
   __THREW__ = 0;
   invoke_viii(27,($281|0),($1171|0),($1186|0));
   $1187 = __THREW__; __THREW__ = 0;
   $1188 = $1187&1;
   if ($1188) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   (invoke_iii(28,($237|0),($281|0))|0);
   $1189 = __THREW__; __THREW__ = 0;
   $1190 = $1189&1;
   if ($1190) {
    label = 204;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($281|0));
   $1191 = __THREW__; __THREW__ = 0;
   $1192 = $1191&1;
   if ($1192) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $1193 = __THREW__; __THREW__ = 0;
   $1194 = $1193&1;
   if ($1194) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $1195 = __THREW__; __THREW__ = 0;
   $1196 = $1195&1;
   if ($1196) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($237|0));
   $1197 = __THREW__; __THREW__ = 0;
   $1198 = $1197&1;
   if ($1198) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $1199 = __THREW__; __THREW__ = 0;
   $1200 = $1199&1;
   if ($1200) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $1201 = __THREW__; __THREW__ = 0;
   $1202 = $1201&1;
   if ($1202) {
    label = 28;
    break L13;
   }
   HEAP32[$282>>2] = 4;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($282|0));
   $1203 = __THREW__; __THREW__ = 0;
   $1204 = $1203&1;
   if ($1204) {
    label = 28;
    break L13;
   }
   break;
  }
  case 17:  {
   break;
  }
  default: {
   $1209 = $232;
   $1210 = $230;
   $1211 = (($1210) + ($1209<<2)|0);
   $1212 = HEAP32[$1211>>2]|0;
   __THREW__ = 0;
   invoke_vii(36,($283|0),($1212|0));
   $1213 = __THREW__; __THREW__ = 0;
   $1214 = $1213&1;
   if ($1214) {
    label = 28;
    break L13;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($283|0));
   $1215 = __THREW__; __THREW__ = 0;
   $1216 = $1215&1;
   if ($1216) {
    label = 224;
    break L13;
   }
   __THREW__ = 0;
   invoke_vi(29,($283|0));
   $1217 = __THREW__; __THREW__ = 0;
   $1218 = $1217&1;
   if ($1218) {
    label = 28;
    break L13;
   }
   HEAP32[$284>>2] = 4;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($284|0));
   $1219 = __THREW__; __THREW__ = 0;
   $1220 = $1219&1;
   if ($1220) {
    label = 28;
    break L13;
   }
  }
  }
  $1221 = $232;
  $1222 = $231;
  $1223 = (($1222) + ($1221<<2)|0);
  $1224 = HEAP32[$1223>>2]|0;
  $1225 = ($1224|0)!=(0);
  if ($1225) {
   $$expand_i1_val55 = 0;
   HEAP8[$287>>0] = $$expand_i1_val55;
   $84 = $233;
   $85 = 0;
   $1226 = $84;
   $1227 = ((($1226)) + 16|0);
   $1228 = HEAP32[$1227>>2]|0;
   $1229 = $85;
   $1230 = (($1228) + ($1229))|0;
   $86 = $1230;
   $83 = $1226;
   $1231 = $83;
   $1232 = ((($1231)) + 4|0);
   $1233 = HEAP32[$1232>>2]|0;
   $1234 = $86;
   $1235 = (($1234>>>0) / 1024)&-1;
   $1236 = (($1233) + ($1235<<2)|0);
   $1237 = HEAP32[$1236>>2]|0;
   $1238 = $86;
   $1239 = (($1238>>>0) % 1024)&-1;
   $1240 = (($1237) + ($1239<<2)|0);
   $1241 = HEAP32[$1240>>2]|0;
   $1242 = ($1241|0)<(4);
   if ($1242) {
    $88 = $234;
    $89 = 0;
    $1243 = $88;
    $1244 = ((($1243)) + 16|0);
    $1245 = HEAP32[$1244>>2]|0;
    $1246 = $89;
    $1247 = (($1245) + ($1246))|0;
    $90 = $1247;
    $87 = $1243;
    $1248 = $87;
    $1249 = ((($1248)) + 4|0);
    $1250 = HEAP32[$1249>>2]|0;
    $1251 = $90;
    $1252 = (($1251>>>0) / 341)&-1;
    $1253 = (($1250) + ($1252<<2)|0);
    $1254 = HEAP32[$1253>>2]|0;
    $1255 = $90;
    $1256 = (($1255>>>0) % 341)&-1;
    $1257 = (($1254) + (($1256*12)|0)|0);
    __THREW__ = 0;
    invoke_viii(34,($286|0),(654|0),($1257|0));
    $1258 = __THREW__; __THREW__ = 0;
    $1259 = $1258&1;
    if ($1259) {
     label = 28;
     break;
    }
    $$expand_i1_val57 = 1;
    HEAP8[$287>>0] = $$expand_i1_val57;
    __THREW__ = 0;
    invoke_viii(26,($285|0),($286|0),(656|0));
    $1260 = __THREW__; __THREW__ = 0;
    $1261 = $1260&1;
    if ($1261) {
     label = 225;
     break;
    }
   } else {
    $100 = $234;
    $101 = 0;
    $1262 = $100;
    $1263 = ((($1262)) + 16|0);
    $1264 = HEAP32[$1263>>2]|0;
    $1265 = $101;
    $1266 = (($1264) + ($1265))|0;
    $102 = $1266;
    $99 = $1262;
    $1267 = $99;
    $1268 = ((($1267)) + 4|0);
    $1269 = HEAP32[$1268>>2]|0;
    $1270 = $102;
    $1271 = (($1270>>>0) / 341)&-1;
    $1272 = (($1269) + ($1271<<2)|0);
    $1273 = HEAP32[$1272>>2]|0;
    $1274 = $102;
    $1275 = (($1274>>>0) % 341)&-1;
    $1276 = (($1273) + (($1275*12)|0)|0);
    __THREW__ = 0;
    invoke_vii(35,($285|0),($1276|0));
    $1277 = __THREW__; __THREW__ = 0;
    $1278 = $1277&1;
    if ($1278) {
     label = 225;
     break;
    }
   }
   __THREW__ = 0;
   (invoke_iii(28,($237|0),($285|0))|0);
   $1279 = __THREW__; __THREW__ = 0;
   $1280 = $1279&1;
   if ($1280) {
    label = 226;
    break;
   }
   __THREW__ = 0;
   invoke_vi(29,($285|0));
   $1281 = __THREW__; __THREW__ = 0;
   $1282 = $1281&1;
   if ($1282) {
    label = 225;
    break;
   }
   $$pre_trunc59 = HEAP8[$287>>0]|0;
   $1283 = $$pre_trunc59&1;
   if ($1283) {
    __THREW__ = 0;
    invoke_vi(29,($286|0));
    $1284 = __THREW__; __THREW__ = 0;
    $1285 = $1284&1;
    if ($1285) {
     label = 28;
     break;
    }
   }
   __THREW__ = 0;
   invoke_vi(30,($234|0));
   $1286 = __THREW__; __THREW__ = 0;
   $1287 = $1286&1;
   if ($1287) {
    label = 28;
    break;
   }
   __THREW__ = 0;
   invoke_viii(26,($288|0),($237|0),(673|0));
   $1288 = __THREW__; __THREW__ = 0;
   $1289 = $1288&1;
   if ($1289) {
    label = 28;
    break;
   }
   __THREW__ = 0;
   invoke_vii(31,($234|0),($288|0));
   $1290 = __THREW__; __THREW__ = 0;
   $1291 = $1290&1;
   if ($1291) {
    label = 229;
    break;
   }
   __THREW__ = 0;
   invoke_vi(29,($288|0));
   $1292 = __THREW__; __THREW__ = 0;
   $1293 = $1292&1;
   if ($1293) {
    label = 28;
    break;
   }
   __THREW__ = 0;
   invoke_vi(32,($233|0));
   $1294 = __THREW__; __THREW__ = 0;
   $1295 = $1294&1;
   if ($1295) {
    label = 28;
    break;
   }
   HEAP32[$289>>2] = 2;
   __THREW__ = 0;
   invoke_vii(33,($233|0),($289|0));
   $1296 = __THREW__; __THREW__ = 0;
   $1297 = $1296&1;
   if ($1297) {
    label = 28;
    break;
   }
  }
  $1315 = $232;
  $1316 = (($1315) + 1)|0;
  $232 = $1316;
 }
 switch (label|0) {
  case 29: {
   $453 = ___cxa_find_matching_catch_2()|0;
   $454 = tempRet0;
   $235 = $453;
   $236 = $454;
   label = 31;
   break;
  }
  case 30: {
   $455 = ___cxa_find_matching_catch_2()|0;
   $456 = tempRet0;
   $235 = $455;
   $236 = $456;
   __THREW__ = 0;
   invoke_vi(29,($240|0));
   $457 = __THREW__; __THREW__ = 0;
   $458 = $457&1;
   if ($458) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 31;
   }
   break;
  }
  case 43: {
   $513 = ___cxa_find_matching_catch_2()|0;
   $514 = tempRet0;
   $235 = $513;
   $236 = $514;
   label = 45;
   break;
  }
  case 44: {
   $515 = ___cxa_find_matching_catch_2()|0;
   $516 = tempRet0;
   $235 = $515;
   $236 = $516;
   __THREW__ = 0;
   invoke_vi(29,($243|0));
   $517 = __THREW__; __THREW__ = 0;
   $518 = $517&1;
   if ($518) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 45;
   }
   break;
  }
  case 73: {
   $663 = ___cxa_find_matching_catch_2()|0;
   $664 = tempRet0;
   $235 = $663;
   $236 = $664;
   label = 75;
   break;
  }
  case 74: {
   $665 = ___cxa_find_matching_catch_2()|0;
   $666 = tempRet0;
   $235 = $665;
   $236 = $666;
   __THREW__ = 0;
   invoke_vi(29,($246|0));
   $667 = __THREW__; __THREW__ = 0;
   $668 = $667&1;
   if ($668) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 75;
   }
   break;
  }
  case 77: {
   $672 = ___cxa_find_matching_catch_2()|0;
   $673 = tempRet0;
   $235 = $672;
   $236 = $673;
   label = 79;
   break;
  }
  case 78: {
   $674 = ___cxa_find_matching_catch_2()|0;
   $675 = tempRet0;
   $235 = $674;
   $236 = $675;
   __THREW__ = 0;
   invoke_vi(29,($249|0));
   $676 = __THREW__; __THREW__ = 0;
   $677 = $676&1;
   if ($677) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 79;
   }
   break;
  }
  case 81: {
   $681 = ___cxa_find_matching_catch_2()|0;
   $682 = tempRet0;
   $235 = $681;
   $236 = $682;
   label = 83;
   break;
  }
  case 82: {
   $683 = ___cxa_find_matching_catch_2()|0;
   $684 = tempRet0;
   $235 = $683;
   $236 = $684;
   __THREW__ = 0;
   invoke_vi(29,($252|0));
   $685 = __THREW__; __THREW__ = 0;
   $686 = $685&1;
   if ($686) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 83;
   }
   break;
  }
  case 111: {
   $831 = ___cxa_find_matching_catch_2()|0;
   $832 = tempRet0;
   $235 = $831;
   $236 = $832;
   label = 113;
   break;
  }
  case 112: {
   $833 = ___cxa_find_matching_catch_2()|0;
   $834 = tempRet0;
   $235 = $833;
   $236 = $834;
   __THREW__ = 0;
   invoke_vi(29,($255|0));
   $835 = __THREW__; __THREW__ = 0;
   $836 = $835&1;
   if ($836) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 113;
   }
   break;
  }
  case 115: {
   $840 = ___cxa_find_matching_catch_2()|0;
   $841 = tempRet0;
   $235 = $840;
   $236 = $841;
   label = 117;
   break;
  }
  case 116: {
   $842 = ___cxa_find_matching_catch_2()|0;
   $843 = tempRet0;
   $235 = $842;
   $236 = $843;
   __THREW__ = 0;
   invoke_vi(29,($258|0));
   $844 = __THREW__; __THREW__ = 0;
   $845 = $844&1;
   if ($845) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 117;
   }
   break;
  }
  case 119: {
   $849 = ___cxa_find_matching_catch_2()|0;
   $850 = tempRet0;
   $235 = $849;
   $236 = $850;
   label = 121;
   break;
  }
  case 120: {
   $851 = ___cxa_find_matching_catch_2()|0;
   $852 = tempRet0;
   $235 = $851;
   $236 = $852;
   __THREW__ = 0;
   invoke_vi(29,($261|0));
   $853 = __THREW__; __THREW__ = 0;
   $854 = $853&1;
   if ($854) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 121;
   }
   break;
  }
  case 149: {
   $999 = ___cxa_find_matching_catch_2()|0;
   $1000 = tempRet0;
   $235 = $999;
   $236 = $1000;
   label = 151;
   break;
  }
  case 150: {
   $1001 = ___cxa_find_matching_catch_2()|0;
   $1002 = tempRet0;
   $235 = $1001;
   $236 = $1002;
   __THREW__ = 0;
   invoke_vi(29,($264|0));
   $1003 = __THREW__; __THREW__ = 0;
   $1004 = $1003&1;
   if ($1004) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 151;
   }
   break;
  }
  case 153: {
   $1008 = ___cxa_find_matching_catch_2()|0;
   $1009 = tempRet0;
   $235 = $1008;
   $236 = $1009;
   label = 155;
   break;
  }
  case 154: {
   $1010 = ___cxa_find_matching_catch_2()|0;
   $1011 = tempRet0;
   $235 = $1010;
   $236 = $1011;
   __THREW__ = 0;
   invoke_vi(29,($267|0));
   $1012 = __THREW__; __THREW__ = 0;
   $1013 = $1012&1;
   if ($1013) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 155;
   }
   break;
  }
  case 157: {
   $1017 = ___cxa_find_matching_catch_2()|0;
   $1018 = tempRet0;
   $235 = $1017;
   $236 = $1018;
   label = 159;
   break;
  }
  case 158: {
   $1019 = ___cxa_find_matching_catch_2()|0;
   $1020 = tempRet0;
   $235 = $1019;
   $236 = $1020;
   __THREW__ = 0;
   invoke_vi(29,($270|0));
   $1021 = __THREW__; __THREW__ = 0;
   $1022 = $1021&1;
   if ($1022) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 159;
   }
   break;
  }
  case 184: {
   $1132 = ___cxa_find_matching_catch_2()|0;
   $1133 = tempRet0;
   $235 = $1132;
   $236 = $1133;
   label = 186;
   break;
  }
  case 185: {
   $1134 = ___cxa_find_matching_catch_2()|0;
   $1135 = tempRet0;
   $235 = $1134;
   $236 = $1135;
   __THREW__ = 0;
   invoke_vi(29,($273|0));
   $1136 = __THREW__; __THREW__ = 0;
   $1137 = $1136&1;
   if ($1137) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 186;
   }
   break;
  }
  case 188: {
   $1141 = ___cxa_find_matching_catch_2()|0;
   $1142 = tempRet0;
   $235 = $1141;
   $236 = $1142;
   label = 194;
   break;
  }
  case 189: {
   $1143 = ___cxa_find_matching_catch_2()|0;
   $1144 = tempRet0;
   $235 = $1143;
   $236 = $1144;
   label = 193;
   break;
  }
  case 190: {
   $1145 = ___cxa_find_matching_catch_2()|0;
   $1146 = tempRet0;
   $235 = $1145;
   $236 = $1146;
   label = 192;
   break;
  }
  case 191: {
   $1147 = ___cxa_find_matching_catch_2()|0;
   $1148 = tempRet0;
   $235 = $1147;
   $236 = $1148;
   __THREW__ = 0;
   invoke_vi(29,($276|0));
   $1149 = __THREW__; __THREW__ = 0;
   $1150 = $1149&1;
   if ($1150) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 192;
   }
   break;
  }
  case 204: {
   $1205 = ___cxa_find_matching_catch_2()|0;
   $1206 = tempRet0;
   $235 = $1205;
   $236 = $1206;
   __THREW__ = 0;
   invoke_vi(29,($281|0));
   $1207 = __THREW__; __THREW__ = 0;
   $1208 = $1207&1;
   if ($1208) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 234;
   }
   break;
  }
  case 224: {
   $1298 = ___cxa_find_matching_catch_2()|0;
   $1299 = tempRet0;
   $235 = $1298;
   $236 = $1299;
   __THREW__ = 0;
   invoke_vi(29,($283|0));
   $1300 = __THREW__; __THREW__ = 0;
   $1301 = $1300&1;
   if ($1301) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 234;
   }
   break;
  }
  case 225: {
   $1302 = ___cxa_find_matching_catch_2()|0;
   $1303 = tempRet0;
   $235 = $1302;
   $236 = $1303;
   label = 227;
   break;
  }
  case 226: {
   $1304 = ___cxa_find_matching_catch_2()|0;
   $1305 = tempRet0;
   $235 = $1304;
   $236 = $1305;
   __THREW__ = 0;
   invoke_vi(29,($285|0));
   $1306 = __THREW__; __THREW__ = 0;
   $1307 = $1306&1;
   if ($1307) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 227;
   }
   break;
  }
  case 229: {
   $1311 = ___cxa_find_matching_catch_2()|0;
   $1312 = tempRet0;
   $235 = $1311;
   $236 = $1312;
   __THREW__ = 0;
   invoke_vi(29,($288|0));
   $1313 = __THREW__; __THREW__ = 0;
   $1314 = $1313&1;
   if ($1314) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 234;
   }
   break;
  }
  case 231: {
   $124 = $234;
   $1317 = $124;
   $123 = $1317;
   $1318 = $123;
   $1319 = ((($1318)) + 4|0);
   $1320 = HEAP32[$1319>>2]|0;
   $1321 = ((($1317)) + 16|0);
   $1322 = HEAP32[$1321>>2]|0;
   $1323 = (($1322>>>0) / 341)&-1;
   $1324 = (($1320) + ($1323<<2)|0);
   $1325 = HEAP32[$1324>>2]|0;
   $1326 = ((($1317)) + 16|0);
   $1327 = HEAP32[$1326>>2]|0;
   $1328 = (($1327>>>0) % 341)&-1;
   $1329 = (($1325) + (($1328*12)|0)|0);
   __THREW__ = 0;
   invoke_vii(35,($0|0),($1329|0));
   $1330 = __THREW__; __THREW__ = 0;
   $1331 = $1330&1;
   if ($1331) {
    label = 28;
   } else {
    __THREW__ = 0;
    invoke_vi(29,($239|0));
    $1332 = __THREW__; __THREW__ = 0;
    $1333 = $1332&1;
    if ($1333) {
     $397 = ___cxa_find_matching_catch_2()|0;
     $398 = tempRet0;
     $235 = $397;
     $236 = $398;
     label = 236;
     break;
    }
    __THREW__ = 0;
    invoke_vi(29,($238|0));
    $1334 = __THREW__; __THREW__ = 0;
    $1335 = $1334&1;
    if ($1335) {
     $395 = ___cxa_find_matching_catch_2()|0;
     $396 = tempRet0;
     $235 = $395;
     $236 = $396;
     label = 238;
     break;
    }
    __THREW__ = 0;
    invoke_vi(29,($237|0));
    $1338 = __THREW__; __THREW__ = 0;
    $1339 = $1338&1;
    if ($1339) {
     $393 = ___cxa_find_matching_catch_2()|0;
     $394 = tempRet0;
     $235 = $393;
     $236 = $394;
     label = 240;
     break;
    }
    __THREW__ = 0;
    invoke_vi(37,($234|0));
    $1342 = __THREW__; __THREW__ = 0;
    $1343 = $1342&1;
    if ($1343) {
     $391 = ___cxa_find_matching_catch_2()|0;
     $392 = tempRet0;
     $235 = $391;
     $236 = $392;
     break;
    } else {
     __ZNSt3__25dequeIiNS_9allocatorIiEEED2Ev($233);
     STACKTOP = sp;return;
    }
   }
   break;
  }
 }
 switch (label|0) {
  case 28: {
   $451 = ___cxa_find_matching_catch_2()|0;
   $452 = tempRet0;
   $235 = $451;
   $236 = $452;
   label = 234;
   break;
  }
  case 31: {
   __THREW__ = 0;
   invoke_vi(29,($241|0));
   $459 = __THREW__; __THREW__ = 0;
   $460 = $459&1;
   if ($460) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 234;
   }
   break;
  }
  case 45: {
   __THREW__ = 0;
   invoke_vi(29,($244|0));
   $519 = __THREW__; __THREW__ = 0;
   $520 = $519&1;
   if ($520) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 234;
   }
   break;
  }
  case 75: {
   $$pre_trunc11 = HEAP8[$248>>0]|0;
   $669 = $$pre_trunc11&1;
   if ($669) {
    __THREW__ = 0;
    invoke_vi(29,($247|0));
    $670 = __THREW__; __THREW__ = 0;
    $671 = $670&1;
    if ($671) {
     $1352 = ___cxa_find_matching_catch_3(0|0)|0;
     $1353 = tempRet0;
     ___clang_call_terminate($1352);
     // unreachable;
    } else {
     label = 234;
    }
   } else {
    label = 234;
   }
   break;
  }
  case 79: {
   $$pre_trunc13 = HEAP8[$251>>0]|0;
   $678 = $$pre_trunc13&1;
   if ($678) {
    __THREW__ = 0;
    invoke_vi(29,($250|0));
    $679 = __THREW__; __THREW__ = 0;
    $680 = $679&1;
    if ($680) {
     $1352 = ___cxa_find_matching_catch_3(0|0)|0;
     $1353 = tempRet0;
     ___clang_call_terminate($1352);
     // unreachable;
    } else {
     label = 234;
    }
   } else {
    label = 234;
   }
   break;
  }
  case 83: {
   __THREW__ = 0;
   invoke_vi(29,($253|0));
   $687 = __THREW__; __THREW__ = 0;
   $688 = $687&1;
   if ($688) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 234;
   }
   break;
  }
  case 113: {
   $$pre_trunc27 = HEAP8[$257>>0]|0;
   $837 = $$pre_trunc27&1;
   if ($837) {
    __THREW__ = 0;
    invoke_vi(29,($256|0));
    $838 = __THREW__; __THREW__ = 0;
    $839 = $838&1;
    if ($839) {
     $1352 = ___cxa_find_matching_catch_3(0|0)|0;
     $1353 = tempRet0;
     ___clang_call_terminate($1352);
     // unreachable;
    } else {
     label = 234;
    }
   } else {
    label = 234;
   }
   break;
  }
  case 117: {
   $$pre_trunc29 = HEAP8[$260>>0]|0;
   $846 = $$pre_trunc29&1;
   if ($846) {
    __THREW__ = 0;
    invoke_vi(29,($259|0));
    $847 = __THREW__; __THREW__ = 0;
    $848 = $847&1;
    if ($848) {
     $1352 = ___cxa_find_matching_catch_3(0|0)|0;
     $1353 = tempRet0;
     ___clang_call_terminate($1352);
     // unreachable;
    } else {
     label = 234;
    }
   } else {
    label = 234;
   }
   break;
  }
  case 121: {
   __THREW__ = 0;
   invoke_vi(29,($262|0));
   $855 = __THREW__; __THREW__ = 0;
   $856 = $855&1;
   if ($856) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 234;
   }
   break;
  }
  case 151: {
   $$pre_trunc43 = HEAP8[$266>>0]|0;
   $1005 = $$pre_trunc43&1;
   if ($1005) {
    __THREW__ = 0;
    invoke_vi(29,($265|0));
    $1006 = __THREW__; __THREW__ = 0;
    $1007 = $1006&1;
    if ($1007) {
     $1352 = ___cxa_find_matching_catch_3(0|0)|0;
     $1353 = tempRet0;
     ___clang_call_terminate($1352);
     // unreachable;
    } else {
     label = 234;
    }
   } else {
    label = 234;
   }
   break;
  }
  case 155: {
   $$pre_trunc45 = HEAP8[$269>>0]|0;
   $1014 = $$pre_trunc45&1;
   if ($1014) {
    __THREW__ = 0;
    invoke_vi(29,($268|0));
    $1015 = __THREW__; __THREW__ = 0;
    $1016 = $1015&1;
    if ($1016) {
     $1352 = ___cxa_find_matching_catch_3(0|0)|0;
     $1353 = tempRet0;
     ___clang_call_terminate($1352);
     // unreachable;
    } else {
     label = 234;
    }
   } else {
    label = 234;
   }
   break;
  }
  case 159: {
   __THREW__ = 0;
   invoke_vi(29,($271|0));
   $1023 = __THREW__; __THREW__ = 0;
   $1024 = $1023&1;
   if ($1024) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 234;
   }
   break;
  }
  case 186: {
   $$pre_trunc53 = HEAP8[$275>>0]|0;
   $1138 = $$pre_trunc53&1;
   if ($1138) {
    __THREW__ = 0;
    invoke_vi(29,($274|0));
    $1139 = __THREW__; __THREW__ = 0;
    $1140 = $1139&1;
    if ($1140) {
     $1352 = ___cxa_find_matching_catch_3(0|0)|0;
     $1353 = tempRet0;
     ___clang_call_terminate($1352);
     // unreachable;
    } else {
     label = 234;
    }
   } else {
    label = 234;
   }
   break;
  }
  case 192: {
   __THREW__ = 0;
   invoke_vi(29,($277|0));
   $1151 = __THREW__; __THREW__ = 0;
   $1152 = $1151&1;
   if ($1152) {
    $1352 = ___cxa_find_matching_catch_3(0|0)|0;
    $1353 = tempRet0;
    ___clang_call_terminate($1352);
    // unreachable;
   } else {
    label = 193;
   }
   break;
  }
  case 227: {
   $$pre_trunc61 = HEAP8[$287>>0]|0;
   $1308 = $$pre_trunc61&1;
   if ($1308) {
    __THREW__ = 0;
    invoke_vi(29,($286|0));
    $1309 = __THREW__; __THREW__ = 0;
    $1310 = $1309&1;
    if ($1310) {
     $1352 = ___cxa_find_matching_catch_3(0|0)|0;
     $1353 = tempRet0;
     ___clang_call_terminate($1352);
     // unreachable;
    } else {
     label = 234;
    }
   } else {
    label = 234;
   }
   break;
  }
 }
 if ((label|0) == 193) {
  __THREW__ = 0;
  invoke_vi(29,($278|0));
  $1153 = __THREW__; __THREW__ = 0;
  $1154 = $1153&1;
  if ($1154) {
   $1352 = ___cxa_find_matching_catch_3(0|0)|0;
   $1353 = tempRet0;
   ___clang_call_terminate($1352);
   // unreachable;
  } else {
   label = 194;
  }
 }
 if ((label|0) == 194) {
  __THREW__ = 0;
  invoke_vi(29,($279|0));
  $1155 = __THREW__; __THREW__ = 0;
  $1156 = $1155&1;
  if ($1156) {
   $1352 = ___cxa_find_matching_catch_3(0|0)|0;
   $1353 = tempRet0;
   ___clang_call_terminate($1352);
   // unreachable;
  } else {
   label = 234;
  }
 }
 if ((label|0) == 234) {
  __THREW__ = 0;
  invoke_vi(29,($239|0));
  $1336 = __THREW__; __THREW__ = 0;
  $1337 = $1336&1;
  if ($1337) {
   $1352 = ___cxa_find_matching_catch_3(0|0)|0;
   $1353 = tempRet0;
   ___clang_call_terminate($1352);
   // unreachable;
  } else {
   label = 236;
  }
 }
 if ((label|0) == 236) {
  __THREW__ = 0;
  invoke_vi(29,($238|0));
  $1340 = __THREW__; __THREW__ = 0;
  $1341 = $1340&1;
  if ($1341) {
   $1352 = ___cxa_find_matching_catch_3(0|0)|0;
   $1353 = tempRet0;
   ___clang_call_terminate($1352);
   // unreachable;
  } else {
   label = 238;
  }
 }
 if ((label|0) == 238) {
  __THREW__ = 0;
  invoke_vi(29,($237|0));
  $1344 = __THREW__; __THREW__ = 0;
  $1345 = $1344&1;
  if ($1345) {
   $1352 = ___cxa_find_matching_catch_3(0|0)|0;
   $1353 = tempRet0;
   ___clang_call_terminate($1352);
   // unreachable;
  } else {
   label = 240;
  }
 }
 if ((label|0) == 240) {
  __THREW__ = 0;
  invoke_vi(37,($234|0));
  $1346 = __THREW__; __THREW__ = 0;
  $1347 = $1346&1;
  if ($1347) {
   $1352 = ___cxa_find_matching_catch_3(0|0)|0;
   $1353 = tempRet0;
   ___clang_call_terminate($1352);
   // unreachable;
  }
 }
 __THREW__ = 0;
 invoke_vi(38,($233|0));
 $1348 = __THREW__; __THREW__ = 0;
 $1349 = $1348&1;
 if ($1349) {
  $1352 = ___cxa_find_matching_catch_3(0|0)|0;
  $1353 = tempRet0;
  ___clang_call_terminate($1352);
  // unreachable;
 } else {
  $1350 = $235;
  $1351 = $236;
  ___resumeException($1350|0);
  // unreachable;
 }
}
function __ZNSt3__2plIcNS_11char_traitsIcEENS_9allocatorIcEEEENS_12basic_stringIT_T0_T1_EERKS9_SB_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0;
 var $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0;
 var $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0;
 var $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0;
 var $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 304|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(304|0);
 $58 = sp + 8|0;
 $61 = sp + 291|0;
 $62 = sp;
 $65 = sp + 290|0;
 $72 = sp + 289|0;
 $73 = sp + 288|0;
 $70 = $1;
 $71 = $2;
 $$expand_i1_val = 0;
 HEAP8[$72>>0] = $$expand_i1_val;
 $78 = $70;
 $69 = $78;
 $79 = $69;
 $68 = $79;
 $80 = $68;
 $67 = $80;
 $81 = $67;
 $66 = $81;
 $63 = $0;
 $64 = $73;
 $82 = $63;
 ;HEAP8[$62>>0]=HEAP8[$65>>0]|0;
 $60 = $82;
 $83 = $60;
 $59 = $62;
 ;HEAP8[$58>>0]=HEAP8[$61>>0]|0;
 $57 = $83;
 $84 = $57;
 $56 = $58;
 ;HEAP32[$84>>2]=0|0;HEAP32[$84+4>>2]=0|0;HEAP32[$84+8>>2]=0|0;
 $53 = $82;
 $85 = $53;
 $52 = $85;
 $86 = $52;
 $51 = $86;
 $87 = $51;
 $54 = $87;
 $55 = 0;
 while(1) {
  $88 = $55;
  $89 = ($88>>>0)<(3);
  if (!($89)) {
   break;
  }
  $90 = $55;
  $91 = $54;
  $92 = (($91) + ($90<<2)|0);
  HEAP32[$92>>2] = 0;
  $93 = $55;
  $94 = (($93) + 1)|0;
  $55 = $94;
 }
 $95 = $70;
 $12 = $95;
 $96 = $12;
 $11 = $96;
 $97 = $11;
 $10 = $97;
 $98 = $10;
 $9 = $98;
 $99 = $9;
 $100 = ((($99)) + 11|0);
 $101 = HEAP8[$100>>0]|0;
 $102 = $101&255;
 $103 = $102 & 128;
 $104 = ($103|0)!=(0);
 if ($104) {
  $5 = $96;
  $105 = $5;
  $4 = $105;
  $106 = $4;
  $3 = $106;
  $107 = $3;
  $108 = ((($107)) + 4|0);
  $109 = HEAP32[$108>>2]|0;
  $116 = $109;
 } else {
  $8 = $96;
  $110 = $8;
  $7 = $110;
  $111 = $7;
  $6 = $111;
  $112 = $6;
  $113 = ((($112)) + 11|0);
  $114 = HEAP8[$113>>0]|0;
  $115 = $114&255;
  $116 = $115;
 }
 $74 = $116;
 $117 = $71;
 $22 = $117;
 $118 = $22;
 $21 = $118;
 $119 = $21;
 $20 = $119;
 $120 = $20;
 $19 = $120;
 $121 = $19;
 $122 = ((($121)) + 11|0);
 $123 = HEAP8[$122>>0]|0;
 $124 = $123&255;
 $125 = $124 & 128;
 $126 = ($125|0)!=(0);
 if ($126) {
  $15 = $118;
  $127 = $15;
  $14 = $127;
  $128 = $14;
  $13 = $128;
  $129 = $13;
  $130 = ((($129)) + 4|0);
  $131 = HEAP32[$130>>2]|0;
  $138 = $131;
 } else {
  $18 = $118;
  $132 = $18;
  $17 = $132;
  $133 = $17;
  $16 = $133;
  $134 = $16;
  $135 = ((($134)) + 11|0);
  $136 = HEAP8[$135>>0]|0;
  $137 = $136&255;
  $138 = $137;
 }
 $75 = $138;
 $139 = $70;
 $36 = $139;
 $140 = $36;
 $35 = $140;
 $141 = $35;
 $34 = $141;
 $142 = $34;
 $33 = $142;
 $143 = $33;
 $32 = $143;
 $144 = $32;
 $145 = ((($144)) + 11|0);
 $146 = HEAP8[$145>>0]|0;
 $147 = $146&255;
 $148 = $147 & 128;
 $149 = ($148|0)!=(0);
 if ($149) {
  $26 = $141;
  $150 = $26;
  $25 = $150;
  $151 = $25;
  $24 = $151;
  $152 = $24;
  $153 = HEAP32[$152>>2]|0;
  $159 = $153;
 } else {
  $31 = $141;
  $154 = $31;
  $30 = $154;
  $155 = $30;
  $29 = $155;
  $156 = $29;
  $28 = $156;
  $157 = $28;
  $27 = $157;
  $158 = $27;
  $159 = $158;
 }
 $23 = $159;
 $160 = $23;
 $161 = $74;
 $162 = $74;
 $163 = $75;
 $164 = (($162) + ($163))|0;
 __THREW__ = 0;
 invoke_viiii(39,($0|0),($160|0),($161|0),($164|0));
 $165 = __THREW__; __THREW__ = 0;
 $166 = $165&1;
 if (!($166)) {
  $167 = $71;
  $50 = $167;
  $168 = $50;
  $49 = $168;
  $169 = $49;
  $48 = $169;
  $170 = $48;
  $47 = $170;
  $171 = $47;
  $46 = $171;
  $172 = $46;
  $173 = ((($172)) + 11|0);
  $174 = HEAP8[$173>>0]|0;
  $175 = $174&255;
  $176 = $175 & 128;
  $177 = ($176|0)!=(0);
  if ($177) {
   $40 = $169;
   $178 = $40;
   $39 = $178;
   $179 = $39;
   $38 = $179;
   $180 = $38;
   $181 = HEAP32[$180>>2]|0;
   $187 = $181;
  } else {
   $45 = $169;
   $182 = $45;
   $44 = $182;
   $183 = $44;
   $43 = $183;
   $184 = $43;
   $42 = $184;
   $185 = $42;
   $41 = $185;
   $186 = $41;
   $187 = $186;
  }
  $37 = $187;
  $188 = $37;
  $189 = $75;
  __THREW__ = 0;
  (invoke_iiii(40,($0|0),($188|0),($189|0))|0);
  $190 = __THREW__; __THREW__ = 0;
  $191 = $190&1;
  if (!($191)) {
   $$expand_i1_val2 = 1;
   HEAP8[$72>>0] = $$expand_i1_val2;
   $$pre_trunc = HEAP8[$72>>0]|0;
   $192 = $$pre_trunc&1;
   if ($192) {
    STACKTOP = sp;return;
   }
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0);
   STACKTOP = sp;return;
  }
 }
 $193 = ___cxa_find_matching_catch_2()|0;
 $194 = tempRet0;
 $76 = $193;
 $77 = $194;
 __THREW__ = 0;
 invoke_vi(29,($0|0));
 $195 = __THREW__; __THREW__ = 0;
 $196 = $195&1;
 if ($196) {
  $199 = ___cxa_find_matching_catch_3(0|0)|0;
  $200 = tempRet0;
  ___clang_call_terminate($199);
  // unreachable;
 } else {
  $197 = $76;
  $198 = $77;
  ___resumeException($197|0);
  // unreachable;
 }
}
function __ZNSt3__2plIcNS_11char_traitsIcEENS_9allocatorIcEEEENS_12basic_stringIT_T0_T1_EERKS9_PKS6_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0;
 var $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $34 = sp + 8|0;
 $37 = sp + 195|0;
 $38 = sp;
 $41 = sp + 194|0;
 $48 = sp + 193|0;
 $49 = sp + 192|0;
 $46 = $1;
 $47 = $2;
 $$expand_i1_val = 0;
 HEAP8[$48>>0] = $$expand_i1_val;
 $54 = $46;
 $45 = $54;
 $55 = $45;
 $44 = $55;
 $56 = $44;
 $43 = $56;
 $57 = $43;
 $42 = $57;
 $39 = $0;
 $40 = $49;
 $58 = $39;
 ;HEAP8[$38>>0]=HEAP8[$41>>0]|0;
 $36 = $58;
 $59 = $36;
 $35 = $38;
 ;HEAP8[$34>>0]=HEAP8[$37>>0]|0;
 $33 = $59;
 $60 = $33;
 $32 = $34;
 ;HEAP32[$60>>2]=0|0;HEAP32[$60+4>>2]=0|0;HEAP32[$60+8>>2]=0|0;
 $29 = $58;
 $61 = $29;
 $28 = $61;
 $62 = $28;
 $27 = $62;
 $63 = $27;
 $30 = $63;
 $31 = 0;
 while(1) {
  $64 = $31;
  $65 = ($64>>>0)<(3);
  if (!($65)) {
   break;
  }
  $66 = $31;
  $67 = $30;
  $68 = (($67) + ($66<<2)|0);
  HEAP32[$68>>2] = 0;
  $69 = $31;
  $70 = (($69) + 1)|0;
  $31 = $70;
 }
 $71 = $46;
 $12 = $71;
 $72 = $12;
 $11 = $72;
 $73 = $11;
 $10 = $73;
 $74 = $10;
 $9 = $74;
 $75 = $9;
 $76 = ((($75)) + 11|0);
 $77 = HEAP8[$76>>0]|0;
 $78 = $77&255;
 $79 = $78 & 128;
 $80 = ($79|0)!=(0);
 if ($80) {
  $5 = $72;
  $81 = $5;
  $4 = $81;
  $82 = $4;
  $3 = $82;
  $83 = $3;
  $84 = ((($83)) + 4|0);
  $85 = HEAP32[$84>>2]|0;
  $92 = $85;
 } else {
  $8 = $72;
  $86 = $8;
  $7 = $86;
  $87 = $7;
  $6 = $87;
  $88 = $6;
  $89 = ((($88)) + 11|0);
  $90 = HEAP8[$89>>0]|0;
  $91 = $90&255;
  $92 = $91;
 }
 $50 = $92;
 $93 = $47;
 __THREW__ = 0;
 $94 = (invoke_ii(41,($93|0))|0);
 $95 = __THREW__; __THREW__ = 0;
 $96 = $95&1;
 if (!($96)) {
  $51 = $94;
  $97 = $46;
  $26 = $97;
  $98 = $26;
  $25 = $98;
  $99 = $25;
  $24 = $99;
  $100 = $24;
  $23 = $100;
  $101 = $23;
  $22 = $101;
  $102 = $22;
  $103 = ((($102)) + 11|0);
  $104 = HEAP8[$103>>0]|0;
  $105 = $104&255;
  $106 = $105 & 128;
  $107 = ($106|0)!=(0);
  if ($107) {
   $16 = $99;
   $108 = $16;
   $15 = $108;
   $109 = $15;
   $14 = $109;
   $110 = $14;
   $111 = HEAP32[$110>>2]|0;
   $117 = $111;
  } else {
   $21 = $99;
   $112 = $21;
   $20 = $112;
   $113 = $20;
   $19 = $113;
   $114 = $19;
   $18 = $114;
   $115 = $18;
   $17 = $115;
   $116 = $17;
   $117 = $116;
  }
  $13 = $117;
  $118 = $13;
  $119 = $50;
  $120 = $50;
  $121 = $51;
  $122 = (($120) + ($121))|0;
  __THREW__ = 0;
  invoke_viiii(39,($0|0),($118|0),($119|0),($122|0));
  $123 = __THREW__; __THREW__ = 0;
  $124 = $123&1;
  if (!($124)) {
   $125 = $47;
   $126 = $51;
   __THREW__ = 0;
   (invoke_iiii(40,($0|0),($125|0),($126|0))|0);
   $127 = __THREW__; __THREW__ = 0;
   $128 = $127&1;
   if (!($128)) {
    $$expand_i1_val2 = 1;
    HEAP8[$48>>0] = $$expand_i1_val2;
    $$pre_trunc = HEAP8[$48>>0]|0;
    $129 = $$pre_trunc&1;
    if ($129) {
     STACKTOP = sp;return;
    }
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0);
    STACKTOP = sp;return;
   }
  }
 }
 $130 = ___cxa_find_matching_catch_2()|0;
 $131 = tempRet0;
 $52 = $130;
 $53 = $131;
 __THREW__ = 0;
 invoke_vi(29,($0|0));
 $132 = __THREW__; __THREW__ = 0;
 $133 = $132&1;
 if ($133) {
  $136 = ___cxa_find_matching_catch_3(0|0)|0;
  $137 = tempRet0;
  ___clang_call_terminate($136);
  // unreachable;
 } else {
  $134 = $52;
  $135 = $53;
  ___resumeException($134|0);
  // unreachable;
 }
}
function ___clang_call_terminate($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (___cxa_begin_catch(($0|0))|0);
 __ZSt9terminatev();
 // unreachable;
}
function __ZNSt3__25dequeINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE9pop_frontEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $85 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $4 = sp + 8|0;
 $7 = sp + 121|0;
 $22 = sp;
 $25 = sp + 120|0;
 $30 = $0;
 $32 = $30;
 $29 = $32;
 $33 = $29;
 $34 = ((($33)) + 20|0);
 $28 = $34;
 $35 = $28;
 $27 = $35;
 $36 = $27;
 $31 = $36;
 $37 = $31;
 $12 = $32;
 $38 = $12;
 $39 = ((($38)) + 4|0);
 $40 = HEAP32[$39>>2]|0;
 $41 = ((($32)) + 16|0);
 $42 = HEAP32[$41>>2]|0;
 $43 = (($42>>>0) / 341)&-1;
 $44 = (($40) + ($43<<2)|0);
 $45 = HEAP32[$44>>2]|0;
 $46 = ((($32)) + 16|0);
 $47 = HEAP32[$46>>2]|0;
 $48 = (($47>>>0) % 341)&-1;
 $49 = (($45) + (($48*12)|0)|0);
 $1 = $49;
 $50 = $1;
 $5 = $37;
 $6 = $50;
 $51 = $5;
 $52 = $6;
 ;HEAP8[$4>>0]=HEAP8[$7>>0]|0;
 $2 = $51;
 $3 = $52;
 $53 = $3;
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($53);
 $10 = $32;
 $54 = $10;
 $55 = ((($54)) + 20|0);
 $9 = $55;
 $56 = $9;
 $8 = $56;
 $57 = $8;
 $58 = HEAP32[$57>>2]|0;
 $59 = (($58) + -1)|0;
 HEAP32[$57>>2] = $59;
 $60 = ((($32)) + 16|0);
 $61 = HEAP32[$60>>2]|0;
 $62 = (($61) + 1)|0;
 HEAP32[$60>>2] = $62;
 $63 = ($62>>>0)>=(682);
 if (!($63)) {
  STACKTOP = sp;return;
 }
 $64 = $31;
 $11 = $32;
 $65 = $11;
 $66 = ((($65)) + 4|0);
 $67 = HEAP32[$66>>2]|0;
 $68 = HEAP32[$67>>2]|0;
 $17 = $64;
 $18 = $68;
 $19 = 341;
 $69 = $17;
 $70 = $18;
 $71 = $19;
 $14 = $69;
 $15 = $70;
 $16 = $71;
 $72 = $15;
 $13 = $72;
 $73 = $13;
 __ZdlPv($73);
 $26 = $32;
 $74 = $26;
 $75 = ((($74)) + 4|0);
 $76 = HEAP32[$75>>2]|0;
 $77 = ((($76)) + 4|0);
 $23 = $74;
 $24 = $77;
 $78 = $23;
 $79 = $24;
 ;HEAP8[$22>>0]=HEAP8[$25>>0]|0;
 $20 = $78;
 $21 = $79;
 $80 = $20;
 $81 = $21;
 $82 = ((($80)) + 4|0);
 HEAP32[$82>>2] = $81;
 $83 = ((($32)) + 16|0);
 $84 = HEAP32[$83>>2]|0;
 $85 = (($84) - 341)|0;
 HEAP32[$83>>2] = $85;
 STACKTOP = sp;return;
}
function __ZNSt3__25dequeINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE10push_frontERKS6_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $18 = sp;
 $15 = $0;
 $16 = $1;
 $19 = $15;
 $14 = $19;
 $20 = $14;
 $21 = ((($20)) + 20|0);
 $13 = $21;
 $22 = $13;
 $12 = $22;
 $23 = $12;
 $17 = $23;
 $5 = $19;
 $24 = $5;
 $25 = ((($24)) + 16|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ($26|0)==(0);
 if ($27) {
  __ZNSt3__25dequeINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE20__add_front_capacityEv($19);
 }
 $28 = $17;
 __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE5beginEv($18,$19);
 $2 = $18;
 $29 = $2;
 $30 = ((($29)) + 4|0);
 $31 = HEAP32[$30>>2]|0;
 $32 = HEAP32[$29>>2]|0;
 $33 = HEAP32[$32>>2]|0;
 $34 = ($31|0)==($33|0);
 if ($34) {
  $35 = HEAP32[$29>>2]|0;
  $36 = ((($35)) + -4|0);
  HEAP32[$29>>2] = $36;
  $37 = HEAP32[$29>>2]|0;
  $38 = HEAP32[$37>>2]|0;
  $39 = ((($38)) + 4092|0);
  $40 = ((($29)) + 4|0);
  HEAP32[$40>>2] = $39;
 }
 $41 = ((($29)) + 4|0);
 $42 = HEAP32[$41>>2]|0;
 $43 = ((($42)) + -12|0);
 HEAP32[$41>>2] = $43;
 $3 = $29;
 $44 = $3;
 $45 = ((($44)) + 4|0);
 $46 = HEAP32[$45>>2]|0;
 $4 = $46;
 $47 = $4;
 $48 = $16;
 $6 = $28;
 $7 = $47;
 $8 = $48;
 $49 = $7;
 $50 = $8;
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_($49,$50);
 $51 = ((($19)) + 16|0);
 $52 = HEAP32[$51>>2]|0;
 $53 = (($52) + -1)|0;
 HEAP32[$51>>2] = $53;
 $11 = $19;
 $54 = $11;
 $55 = ((($54)) + 20|0);
 $10 = $55;
 $56 = $10;
 $9 = $56;
 $57 = $9;
 $58 = HEAP32[$57>>2]|0;
 $59 = (($58) + 1)|0;
 HEAP32[$57>>2] = $59;
 STACKTOP = sp;return;
}
function __ZNSt3__25dequeIiNS_9allocatorIiEEE9pop_frontEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0;
 var $82 = 0, $83 = 0, $84 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $4 = sp + 8|0;
 $7 = sp + 121|0;
 $22 = sp;
 $25 = sp + 120|0;
 $30 = $0;
 $32 = $30;
 $29 = $32;
 $33 = $29;
 $34 = ((($33)) + 20|0);
 $28 = $34;
 $35 = $28;
 $27 = $35;
 $36 = $27;
 $31 = $36;
 $37 = $31;
 $12 = $32;
 $38 = $12;
 $39 = ((($38)) + 4|0);
 $40 = HEAP32[$39>>2]|0;
 $41 = ((($32)) + 16|0);
 $42 = HEAP32[$41>>2]|0;
 $43 = (($42>>>0) / 1024)&-1;
 $44 = (($40) + ($43<<2)|0);
 $45 = HEAP32[$44>>2]|0;
 $46 = ((($32)) + 16|0);
 $47 = HEAP32[$46>>2]|0;
 $48 = (($47>>>0) % 1024)&-1;
 $49 = (($45) + ($48<<2)|0);
 $1 = $49;
 $50 = $1;
 $5 = $37;
 $6 = $50;
 $51 = $5;
 $52 = $6;
 ;HEAP8[$4>>0]=HEAP8[$7>>0]|0;
 $2 = $51;
 $3 = $52;
 $10 = $32;
 $53 = $10;
 $54 = ((($53)) + 20|0);
 $9 = $54;
 $55 = $9;
 $8 = $55;
 $56 = $8;
 $57 = HEAP32[$56>>2]|0;
 $58 = (($57) + -1)|0;
 HEAP32[$56>>2] = $58;
 $59 = ((($32)) + 16|0);
 $60 = HEAP32[$59>>2]|0;
 $61 = (($60) + 1)|0;
 HEAP32[$59>>2] = $61;
 $62 = ($61>>>0)>=(2048);
 if (!($62)) {
  STACKTOP = sp;return;
 }
 $63 = $31;
 $11 = $32;
 $64 = $11;
 $65 = ((($64)) + 4|0);
 $66 = HEAP32[$65>>2]|0;
 $67 = HEAP32[$66>>2]|0;
 $17 = $63;
 $18 = $67;
 $19 = 1024;
 $68 = $17;
 $69 = $18;
 $70 = $19;
 $14 = $68;
 $15 = $69;
 $16 = $70;
 $71 = $15;
 $13 = $71;
 $72 = $13;
 __ZdlPv($72);
 $26 = $32;
 $73 = $26;
 $74 = ((($73)) + 4|0);
 $75 = HEAP32[$74>>2]|0;
 $76 = ((($75)) + 4|0);
 $23 = $73;
 $24 = $76;
 $77 = $23;
 $78 = $24;
 ;HEAP8[$22>>0]=HEAP8[$25>>0]|0;
 $20 = $77;
 $21 = $78;
 $79 = $20;
 $80 = $21;
 $81 = ((($79)) + 4|0);
 HEAP32[$81>>2] = $80;
 $82 = ((($32)) + 16|0);
 $83 = HEAP32[$82>>2]|0;
 $84 = (($83) - 1024)|0;
 HEAP32[$82>>2] = $84;
 STACKTOP = sp;return;
}
function __ZNSt3__25dequeIiNS_9allocatorIiEEE10push_frontERKi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $18 = sp;
 $15 = $0;
 $16 = $1;
 $19 = $15;
 $14 = $19;
 $20 = $14;
 $21 = ((($20)) + 20|0);
 $13 = $21;
 $22 = $13;
 $12 = $22;
 $23 = $12;
 $17 = $23;
 $2 = $19;
 $24 = $2;
 $25 = ((($24)) + 16|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ($26|0)==(0);
 if ($27) {
  __ZNSt3__25dequeIiNS_9allocatorIiEEE20__add_front_capacityEv($19);
 }
 $28 = $17;
 __ZNSt3__212__deque_baseIiNS_9allocatorIiEEE5beginEv($18,$19);
 $3 = $18;
 $29 = $3;
 $30 = ((($29)) + 4|0);
 $31 = HEAP32[$30>>2]|0;
 $32 = HEAP32[$29>>2]|0;
 $33 = HEAP32[$32>>2]|0;
 $34 = ($31|0)==($33|0);
 if ($34) {
  $35 = HEAP32[$29>>2]|0;
  $36 = ((($35)) + -4|0);
  HEAP32[$29>>2] = $36;
  $37 = HEAP32[$29>>2]|0;
  $38 = HEAP32[$37>>2]|0;
  $39 = ((($38)) + 4096|0);
  $40 = ((($29)) + 4|0);
  HEAP32[$40>>2] = $39;
 }
 $41 = ((($29)) + 4|0);
 $42 = HEAP32[$41>>2]|0;
 $43 = ((($42)) + -4|0);
 HEAP32[$41>>2] = $43;
 $4 = $29;
 $44 = $4;
 $45 = ((($44)) + 4|0);
 $46 = HEAP32[$45>>2]|0;
 $5 = $46;
 $47 = $5;
 $48 = $16;
 $6 = $28;
 $7 = $47;
 $8 = $48;
 $49 = $7;
 $50 = $8;
 $51 = HEAP32[$50>>2]|0;
 HEAP32[$49>>2] = $51;
 $52 = ((($19)) + 16|0);
 $53 = HEAP32[$52>>2]|0;
 $54 = (($53) + -1)|0;
 HEAP32[$52>>2] = $54;
 $11 = $19;
 $55 = $11;
 $56 = ((($55)) + 20|0);
 $10 = $56;
 $57 = $10;
 $9 = $57;
 $58 = $9;
 $59 = HEAP32[$58>>2]|0;
 $60 = (($59) + 1)|0;
 HEAP32[$58>>2] = $60;
 STACKTOP = sp;return;
}
function __ZNSt3__2plIcNS_11char_traitsIcEENS_9allocatorIcEEEENS_12basic_stringIT_T0_T1_EEPKS6_RKS9_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$expand_i1_val = 0, $$expand_i1_val2 = 0, $$pre_trunc = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0;
 var $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0;
 var $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $34 = sp + 8|0;
 $37 = sp + 195|0;
 $38 = sp;
 $41 = sp + 194|0;
 $48 = sp + 193|0;
 $49 = sp + 192|0;
 $46 = $1;
 $47 = $2;
 $$expand_i1_val = 0;
 HEAP8[$48>>0] = $$expand_i1_val;
 $54 = $47;
 $45 = $54;
 $55 = $45;
 $44 = $55;
 $56 = $44;
 $43 = $56;
 $57 = $43;
 $42 = $57;
 $39 = $0;
 $40 = $49;
 $58 = $39;
 ;HEAP8[$38>>0]=HEAP8[$41>>0]|0;
 $36 = $58;
 $59 = $36;
 $35 = $38;
 ;HEAP8[$34>>0]=HEAP8[$37>>0]|0;
 $33 = $59;
 $60 = $33;
 $32 = $34;
 ;HEAP32[$60>>2]=0|0;HEAP32[$60+4>>2]=0|0;HEAP32[$60+8>>2]=0|0;
 $29 = $58;
 $61 = $29;
 $28 = $61;
 $62 = $28;
 $27 = $62;
 $63 = $27;
 $30 = $63;
 $31 = 0;
 while(1) {
  $64 = $31;
  $65 = ($64>>>0)<(3);
  if (!($65)) {
   break;
  }
  $66 = $31;
  $67 = $30;
  $68 = (($67) + ($66<<2)|0);
  HEAP32[$68>>2] = 0;
  $69 = $31;
  $70 = (($69) + 1)|0;
  $31 = $70;
 }
 $71 = $46;
 __THREW__ = 0;
 $72 = (invoke_ii(41,($71|0))|0);
 $73 = __THREW__; __THREW__ = 0;
 $74 = $73&1;
 if (!($74)) {
  $50 = $72;
  $75 = $47;
  $12 = $75;
  $76 = $12;
  $11 = $76;
  $77 = $11;
  $10 = $77;
  $78 = $10;
  $9 = $78;
  $79 = $9;
  $80 = ((($79)) + 11|0);
  $81 = HEAP8[$80>>0]|0;
  $82 = $81&255;
  $83 = $82 & 128;
  $84 = ($83|0)!=(0);
  if ($84) {
   $5 = $76;
   $85 = $5;
   $4 = $85;
   $86 = $4;
   $3 = $86;
   $87 = $3;
   $88 = ((($87)) + 4|0);
   $89 = HEAP32[$88>>2]|0;
   $96 = $89;
  } else {
   $8 = $76;
   $90 = $8;
   $7 = $90;
   $91 = $7;
   $6 = $91;
   $92 = $6;
   $93 = ((($92)) + 11|0);
   $94 = HEAP8[$93>>0]|0;
   $95 = $94&255;
   $96 = $95;
  }
  $53 = $96;
  $97 = $46;
  $98 = $50;
  $99 = $50;
  $100 = $53;
  $101 = (($99) + ($100))|0;
  __THREW__ = 0;
  invoke_viiii(39,($0|0),($97|0),($98|0),($101|0));
  $102 = __THREW__; __THREW__ = 0;
  $103 = $102&1;
  if (!($103)) {
   $104 = $47;
   $26 = $104;
   $105 = $26;
   $25 = $105;
   $106 = $25;
   $24 = $106;
   $107 = $24;
   $23 = $107;
   $108 = $23;
   $22 = $108;
   $109 = $22;
   $110 = ((($109)) + 11|0);
   $111 = HEAP8[$110>>0]|0;
   $112 = $111&255;
   $113 = $112 & 128;
   $114 = ($113|0)!=(0);
   if ($114) {
    $16 = $106;
    $115 = $16;
    $15 = $115;
    $116 = $15;
    $14 = $116;
    $117 = $14;
    $118 = HEAP32[$117>>2]|0;
    $124 = $118;
   } else {
    $21 = $106;
    $119 = $21;
    $20 = $119;
    $120 = $20;
    $19 = $120;
    $121 = $19;
    $18 = $121;
    $122 = $18;
    $17 = $122;
    $123 = $17;
    $124 = $123;
   }
   $13 = $124;
   $125 = $13;
   $126 = $53;
   __THREW__ = 0;
   (invoke_iiii(40,($0|0),($125|0),($126|0))|0);
   $127 = __THREW__; __THREW__ = 0;
   $128 = $127&1;
   if (!($128)) {
    $$expand_i1_val2 = 1;
    HEAP8[$48>>0] = $$expand_i1_val2;
    $$pre_trunc = HEAP8[$48>>0]|0;
    $129 = $$pre_trunc&1;
    if ($129) {
     STACKTOP = sp;return;
    }
    __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0);
    STACKTOP = sp;return;
   }
  }
 }
 $130 = ___cxa_find_matching_catch_2()|0;
 $131 = tempRet0;
 $51 = $130;
 $52 = $131;
 __THREW__ = 0;
 invoke_vi(29,($0|0));
 $132 = __THREW__; __THREW__ = 0;
 $133 = $132&1;
 if ($133) {
  $136 = ___cxa_find_matching_catch_3(0|0)|0;
  $137 = tempRet0;
  ___clang_call_terminate($136);
  // unreachable;
 } else {
  $134 = $51;
  $135 = $52;
  ___resumeException($134|0);
  // unreachable;
 }
}
function __ZNSt3__25dequeINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEED2Ev($2);
 STACKTOP = sp;return;
}
function __ZNSt3__25dequeIiNS_9allocatorIiEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNSt3__212__deque_baseIiNS_9allocatorIiEEED2Ev($2);
 STACKTOP = sp;return;
}
function __Z27permute_digits_and_evaluatev() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond11 = 0, $or$cond13 = 0, $or$cond15 = 0, $or$cond17 = 0, $or$cond19 = 0, $or$cond21 = 0, $or$cond23 = 0, $or$cond3 = 0, $or$cond5 = 0, $or$cond7 = 0, $or$cond9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $0 = 0;
 while(1) {
  $4 = $0;
  $5 = ($4|0)<(4);
  if (!($5)) {
   break;
  }
  $1 = 0;
  while(1) {
   $6 = $1;
   $7 = ($6|0)<(4);
   if (!($7)) {
    break;
   }
   $2 = 0;
   while(1) {
    $8 = $2;
    $9 = ($8|0)<(4);
    if (!($9)) {
     break;
    }
    $3 = 0;
    while(1) {
     $10 = $3;
     $11 = ($10|0)<(4);
     if (!($11)) {
      break;
     }
     $12 = $0;
     $13 = ($12|0)==(0);
     $14 = $1;
     $15 = ($14|0)==(0);
     $or$cond = $13 | $15;
     $16 = $2;
     $17 = ($16|0)==(0);
     $or$cond3 = $or$cond | $17;
     $18 = $3;
     $19 = ($18|0)==(0);
     $or$cond5 = $or$cond3 | $19;
     if ($or$cond5) {
      $20 = $0;
      $21 = ($20|0)==(1);
      $22 = $1;
      $23 = ($22|0)==(1);
      $or$cond7 = $21 | $23;
      $24 = $2;
      $25 = ($24|0)==(1);
      $or$cond9 = $or$cond7 | $25;
      $26 = $3;
      $27 = ($26|0)==(1);
      $or$cond11 = $or$cond9 | $27;
      if ($or$cond11) {
       $28 = $0;
       $29 = ($28|0)==(2);
       $30 = $1;
       $31 = ($30|0)==(2);
       $or$cond13 = $29 | $31;
       $32 = $2;
       $33 = ($32|0)==(2);
       $or$cond15 = $or$cond13 | $33;
       $34 = $3;
       $35 = ($34|0)==(2);
       $or$cond17 = $or$cond15 | $35;
       if ($or$cond17) {
        $36 = $0;
        $37 = ($36|0)==(3);
        $38 = $1;
        $39 = ($38|0)==(3);
        $or$cond19 = $37 | $39;
        $40 = $2;
        $41 = ($40|0)==(3);
        $or$cond21 = $or$cond19 | $41;
        $42 = $3;
        $43 = ($42|0)==(3);
        $or$cond23 = $or$cond21 | $43;
        if ($or$cond23) {
         $44 = $0;
         $45 = (3808 + ($44<<2)|0);
         $46 = HEAP32[$45>>2]|0;
         $47 = $1;
         $48 = (3808 + ($47<<2)|0);
         $49 = HEAP32[$48>>2]|0;
         $50 = $2;
         $51 = (3808 + ($50<<2)|0);
         $52 = HEAP32[$51>>2]|0;
         $53 = $3;
         $54 = (3808 + ($53<<2)|0);
         $55 = HEAP32[$54>>2]|0;
         __Z18permute_operationsiiii($46,$49,$52,$55);
        }
       }
      }
     }
     $56 = $3;
     $57 = (($56) + 1)|0;
     $3 = $57;
    }
    $58 = $2;
    $59 = (($58) + 1)|0;
    $2 = $59;
   }
   $60 = $1;
   $61 = (($60) + 1)|0;
   $1 = $61;
  }
  $62 = $0;
  $63 = (($62) + 1)|0;
  $0 = $63;
 }
 STACKTOP = sp;return;
}
function __Z18permute_operationsiiii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = 10;
 while(1) {
  $11 = $8;
  $12 = ($11|0)<(17);
  if (!($12)) {
   break;
  }
  $9 = 10;
  while(1) {
   $13 = $9;
   $14 = ($13|0)<(17);
   if (!($14)) {
    break;
   }
   $10 = 10;
   while(1) {
    $15 = $10;
    $16 = ($15|0)<(17);
    if (!($16)) {
     break;
    }
    $17 = $4;
    $18 = $5;
    $19 = $6;
    $20 = $7;
    $21 = $8;
    $22 = $9;
    $23 = $10;
    __Z16permute_sequenceiiii9operationS_S_($17,$18,$19,$20,$21,$22,$23);
    $24 = $10;
    $25 = (($24) + 1)|0;
    $10 = $25;
   }
   $26 = $9;
   $27 = (($26) + 1)|0;
   $9 = $27;
  }
  $28 = $8;
  $29 = (($28) + 1)|0;
  $8 = $29;
 }
 STACKTOP = sp;return;
}
function __Z16permute_sequenceiiii9operationS_S_($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $10 = 0, $100 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0;
 var $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0;
 var $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 208|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(208|0);
 $16 = sp + 140|0;
 $17 = sp + 112|0;
 $18 = sp + 84|0;
 $19 = sp + 56|0;
 $20 = sp + 28|0;
 $21 = sp;
 $7 = $0;
 $8 = $1;
 $9 = $2;
 $10 = $3;
 $11 = $4;
 $12 = $5;
 $13 = $6;
 $22 = $7;
 HEAP32[$17>>2] = $22;
 $23 = ((($17)) + 4|0);
 $24 = $8;
 HEAP32[$23>>2] = $24;
 $25 = ((($23)) + 4|0);
 $26 = $11;
 HEAP32[$25>>2] = $26;
 $27 = ((($25)) + 4|0);
 $28 = $9;
 HEAP32[$27>>2] = $28;
 $29 = ((($27)) + 4|0);
 $30 = $12;
 HEAP32[$29>>2] = $30;
 $31 = ((($29)) + 4|0);
 $32 = $10;
 HEAP32[$31>>2] = $32;
 $33 = ((($31)) + 4|0);
 $34 = $13;
 HEAP32[$33>>2] = $34;
 $35 = $7;
 HEAP32[$18>>2] = $35;
 $36 = ((($18)) + 4|0);
 $37 = $8;
 HEAP32[$36>>2] = $37;
 $38 = ((($36)) + 4|0);
 $39 = $11;
 HEAP32[$38>>2] = $39;
 $40 = ((($38)) + 4|0);
 $41 = $9;
 HEAP32[$40>>2] = $41;
 $42 = ((($40)) + 4|0);
 $43 = $10;
 HEAP32[$42>>2] = $43;
 $44 = ((($42)) + 4|0);
 $45 = $12;
 HEAP32[$44>>2] = $45;
 $46 = ((($44)) + 4|0);
 $47 = $13;
 HEAP32[$46>>2] = $47;
 $48 = $7;
 HEAP32[$19>>2] = $48;
 $49 = ((($19)) + 4|0);
 $50 = $8;
 HEAP32[$49>>2] = $50;
 $51 = ((($49)) + 4|0);
 $52 = $9;
 HEAP32[$51>>2] = $52;
 $53 = ((($51)) + 4|0);
 $54 = $11;
 HEAP32[$53>>2] = $54;
 $55 = ((($53)) + 4|0);
 $56 = $12;
 HEAP32[$55>>2] = $56;
 $57 = ((($55)) + 4|0);
 $58 = $10;
 HEAP32[$57>>2] = $58;
 $59 = ((($57)) + 4|0);
 $60 = $13;
 HEAP32[$59>>2] = $60;
 $61 = $7;
 HEAP32[$20>>2] = $61;
 $62 = ((($20)) + 4|0);
 $63 = $8;
 HEAP32[$62>>2] = $63;
 $64 = ((($62)) + 4|0);
 $65 = $9;
 HEAP32[$64>>2] = $65;
 $66 = ((($64)) + 4|0);
 $67 = $11;
 HEAP32[$66>>2] = $67;
 $68 = ((($66)) + 4|0);
 $69 = $10;
 HEAP32[$68>>2] = $69;
 $70 = ((($68)) + 4|0);
 $71 = $12;
 HEAP32[$70>>2] = $71;
 $72 = ((($70)) + 4|0);
 $73 = $13;
 HEAP32[$72>>2] = $73;
 $74 = $7;
 HEAP32[$21>>2] = $74;
 $75 = ((($21)) + 4|0);
 $76 = $8;
 HEAP32[$75>>2] = $76;
 $77 = ((($75)) + 4|0);
 $78 = $9;
 HEAP32[$77>>2] = $78;
 $79 = ((($77)) + 4|0);
 $80 = $10;
 HEAP32[$79>>2] = $80;
 $81 = ((($79)) + 4|0);
 $82 = $11;
 HEAP32[$81>>2] = $82;
 $83 = ((($81)) + 4|0);
 $84 = $12;
 HEAP32[$83>>2] = $84;
 $85 = ((($83)) + 4|0);
 $86 = $13;
 HEAP32[$85>>2] = $86;
 $15 = 0;
 while(1) {
  $87 = $15;
  $88 = ($87|0)<(128);
  if (!($88)) {
   break;
  }
  $14 = 0;
  while(1) {
   $89 = $14;
   $90 = ($89|0)<(7);
   if (!($90)) {
    break;
   }
   $91 = $15;
   $92 = $14;
   $93 = $91 >> $92;
   $94 = $93 & 1;
   $95 = $14;
   $96 = (($16) + ($95<<2)|0);
   HEAP32[$96>>2] = $94;
   $97 = $14;
   $98 = (($97) + 1)|0;
   $14 = $98;
  }
  __Z8evaluatePiS_($17,$16);
  __Z8evaluatePiS_($18,$16);
  __Z8evaluatePiS_($19,$16);
  __Z8evaluatePiS_($20,$16);
  __Z8evaluatePiS_($21,$16);
  $99 = $15;
  $100 = (($99) + 1)|0;
  $15 = $100;
 }
 STACKTOP = sp;return;
}
function __Z8evaluatePiS_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $100 = 0.0, $101 = 0.0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0.0, $110 = 0, $111 = 0, $112 = 0, $113 = 0.0, $114 = 0.0, $115 = 0.0, $116 = 0, $117 = 0;
 var $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0.0, $135 = 0;
 var $136 = 0, $137 = 0.0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0.0, $142 = 0, $143 = 0.0, $144 = 0, $145 = 0.0, $146 = 0.0, $147 = 0, $148 = 0, $149 = 0.0, $15 = 0, $150 = 0, $151 = 0, $152 = 0.0, $153 = 0;
 var $154 = 0.0, $155 = 0, $156 = 0.0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $19 = 0, $2 = 0.0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0.0, $27 = 0.0, $28 = 0.0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0.0, $33 = 0.0, $34 = 0.0, $35 = 0, $36 = 0, $37 = 0, $38 = 0.0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0.0, $45 = 0.0, $46 = 0.0, $47 = 0, $48 = 0, $49 = 0, $5 = 0.0, $50 = 0.0, $51 = 0.0, $52 = 0.0, $53 = 0, $54 = 0, $55 = 0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0.0;
 var $60 = 0.0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0.0, $7 = 0, $70 = 0, $71 = 0.0, $72 = 0, $73 = 0.0, $74 = 0, $75 = 0.0, $76 = 0.0, $77 = 0.0, $78 = 0.0;
 var $79 = 0, $8 = 0, $80 = 0.0, $81 = 0.0, $82 = 0.0, $83 = 0, $84 = 0.0, $85 = 0.0, $86 = 0.0, $87 = 0.0, $88 = 0.0, $89 = 0, $9 = 0.0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0.0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 144|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(144|0);
 $16 = sp;
 $17 = sp + 84|0;
 $18 = sp + 80|0;
 $12 = $0;
 $13 = $1;
 HEAP32[$18>>2] = 0;
 $14 = 0;
 L1: while(1) {
  $19 = $14;
  $20 = ($19|0)<(7);
  if (!($20)) {
   label = 31;
   break;
  }
  $21 = $14;
  $22 = $12;
  $23 = (($22) + ($21<<2)|0);
  $24 = HEAP32[$23>>2]|0;
  switch ($24|0) {
  case 10:  {
   $25 = ((($16)) + 8|0);
   $26 = +HEAPF64[$25>>3];
   $27 = +HEAPF64[$16>>3];
   $28 = $26 + $27;
   $29 = ((($16)) + 8|0);
   HEAPF64[$29>>3] = $28;
   $30 = ((($17)) + 4|0);
   HEAP32[$30>>2] = 1;
   __Z4dropPdPiS0_($16,$17,$18);
   break;
  }
  case 11:  {
   $31 = ((($16)) + 8|0);
   $32 = +HEAPF64[$31>>3];
   $33 = +HEAPF64[$16>>3];
   $34 = $32 - $33;
   $35 = ((($16)) + 8|0);
   HEAPF64[$35>>3] = $34;
   $36 = ((($17)) + 4|0);
   HEAP32[$36>>2] = 1;
   __Z4dropPdPiS0_($16,$17,$18);
   break;
  }
  case 12:  {
   $37 = ((($16)) + 8|0);
   $38 = +HEAPF64[$37>>3];
   $39 = +HEAPF64[$16>>3];
   $40 = $38 * $39;
   $41 = ((($16)) + 8|0);
   HEAPF64[$41>>3] = $40;
   $42 = ((($17)) + 4|0);
   HEAP32[$42>>2] = 1;
   __Z4dropPdPiS0_($16,$17,$18);
   break;
  }
  case 13:  {
   $43 = ((($16)) + 8|0);
   $44 = +HEAPF64[$43>>3];
   $45 = +HEAPF64[$16>>3];
   $46 = $44 / $45;
   $47 = ((($16)) + 8|0);
   HEAPF64[$47>>3] = $46;
   $48 = ((($17)) + 4|0);
   HEAP32[$48>>2] = 1;
   __Z4dropPdPiS0_($16,$17,$18);
   break;
  }
  case 14:  {
   $49 = ((($16)) + 8|0);
   $50 = +HEAPF64[$49>>3];
   $51 = +HEAPF64[$16>>3];
   $52 = (+Math_pow((+$50),(+$51)));
   $53 = ((($16)) + 8|0);
   HEAPF64[$53>>3] = $52;
   $54 = ((($17)) + 4|0);
   HEAP32[$54>>2] = 1;
   __Z4dropPdPiS0_($16,$17,$18);
   break;
  }
  case 15:  {
   $55 = ((($16)) + 8|0);
   $56 = +HEAPF64[$55>>3];
   $57 = (+Math_log((+$56)));
   $58 = +HEAPF64[$16>>3];
   $59 = (+Math_log((+$58)));
   $60 = $57 / $59;
   $61 = ((($16)) + 8|0);
   HEAPF64[$61>>3] = $60;
   $62 = ((($17)) + 4|0);
   HEAP32[$62>>2] = 1;
   __Z4dropPdPiS0_($16,$17,$18);
   break;
  }
  case 16:  {
   $63 = HEAP32[$17>>2]|0;
   $64 = ($63|0)!=(0);
   if ($64) {
    label = 38;
    break L1;
   }
   $65 = ((($17)) + 4|0);
   $66 = HEAP32[$65>>2]|0;
   $67 = ($66|0)!=(0);
   if ($67) {
    label = 38;
    break L1;
   }
   $68 = ((($16)) + 8|0);
   $69 = +HEAPF64[$68>>3];
   $70 = $69 == 0.0;
   if ($70) {
    label = 38;
    break L1;
   }
   $71 = +HEAPF64[$16>>3];
   $72 = $71 > 9.0;
   if ($72) {
    label = 38;
    break L1;
   }
   $73 = +HEAPF64[$16>>3];
   $74 = $73 <= 1.0;
   if ($74) {
    $86 = 10.0;
   } else {
    $75 = +HEAPF64[$16>>3];
    $76 = (+_log10($75));
    $77 = (+Math_floor((+$76)));
    $78 = 1.0 + $77;
    $10 = 10;
    $11 = $78;
    $79 = $10;
    $80 = (+($79|0));
    $81 = $11;
    $82 = (+Math_pow((+$80),(+$81)));
    $86 = $82;
   }
   $83 = ((($16)) + 8|0);
   $84 = +HEAPF64[$83>>3];
   $85 = $86 * $84;
   $87 = +HEAPF64[$16>>3];
   $88 = $85 + $87;
   $89 = ((($16)) + 8|0);
   HEAPF64[$89>>3] = $88;
   __Z4dropPdPiS0_($16,$17,$18);
   break;
  }
  case 17:  {
   break;
  }
  default: {
   $90 = ((($16)) + 8|0);
   _memmove(($90|0),($16|0),32)|0;
   $91 = $14;
   $92 = $12;
   $93 = (($92) + ($91<<2)|0);
   $94 = HEAP32[$93>>2]|0;
   $95 = (+($94|0));
   HEAPF64[$16>>3] = $95;
   $96 = ((($17)) + 4|0);
   _memmove(($96|0),($17|0),16)|0;
   HEAP32[$17>>2] = 0;
   $97 = HEAP32[$18>>2]|0;
   $98 = (($97) + 1)|0;
   HEAP32[$18>>2] = $98;
  }
  }
  $99 = +HEAPF64[$16>>3];
  $9 = $99;
  $100 = $9;
  $6 = $100;
  $101 = $6;
  __THREW__ = 0;
  $102 = (invoke_id(42,(+$101))|0);
  $103 = tempRet0;
  $104 = __THREW__; __THREW__ = 0;
  $105 = $104&1;
  if ($105) {
   label = 19;
   break;
  }
  $109 = $103 & 2147483647;
  $110 = ($102|0)==(0);
  $111 = ($109|0)==(2146435072);
  $112 = $110 & $111;
  if ($112) {
   label = 38;
   break;
  }
  $113 = +HEAPF64[$16>>3];
  $5 = $113;
  $114 = $5;
  $2 = $114;
  $115 = $2;
  __THREW__ = 0;
  $116 = (invoke_id(42,(+$115))|0);
  $117 = tempRet0;
  $118 = __THREW__; __THREW__ = 0;
  $119 = $118&1;
  if ($119) {
   label = 22;
   break;
  }
  $123 = $117 & 2147483647;
  $124 = ($123>>>0)>(2146435072);
  $125 = ($116>>>0)>(0);
  $126 = ($123|0)==(2146435072);
  $127 = $126 & $125;
  $128 = $124 | $127;
  if ($128) {
   label = 38;
   break;
  }
  $129 = $14;
  $130 = $13;
  $131 = (($130) + ($129<<2)|0);
  $132 = HEAP32[$131>>2]|0;
  $133 = ($132|0)!=(0);
  if ($133) {
   $134 = +HEAPF64[$16>>3];
   $135 = (__ZL11is_integrald($134)|0);
   $136 = ($135|0)!=(0);
   if (!($136)) {
    label = 38;
    break;
   }
   $137 = +HEAPF64[$16>>3];
   $138 = $137 < 3.0;
   if ($138) {
    $139 = $15;
    $140 = (($16) + ($139<<3)|0);
    $141 = +HEAPF64[$140>>3];
    $142 = $141 != 0.0;
    if ($142) {
     label = 38;
     break;
    }
   }
   $143 = +HEAPF64[$16>>3];
   $144 = $143 > 20.0;
   if ($144) {
    label = 38;
    break;
   }
   $145 = +HEAPF64[$16>>3];
   $146 = (+__ZL9factoriald($145));
   HEAPF64[$16>>3] = $146;
   HEAP32[$17>>2] = 1;
  }
  $147 = $14;
  $148 = (($147) + 1)|0;
  $14 = $148;
 }
 if ((label|0) == 19) {
  $106 = ___cxa_find_matching_catch_2()|0;
  $107 = tempRet0;
  $7 = $106;
  $8 = $107;
  $108 = $7;
  ___cxa_call_unexpected(($108|0));
  // unreachable;
 }
 else if ((label|0) == 22) {
  $120 = ___cxa_find_matching_catch_2()|0;
  $121 = tempRet0;
  $3 = $120;
  $4 = $121;
  $122 = $3;
  ___cxa_call_unexpected(($122|0));
  // unreachable;
 }
 else if ((label|0) == 31) {
  $149 = +HEAPF64[$16>>3];
  $150 = (__ZL11is_integrald($149)|0);
  $151 = ($150|0)!=(0);
  if (!($151)) {
   STACKTOP = sp;return;
  }
  $152 = +HEAPF64[$16>>3];
  $153 = $152 > 0.0;
  if (!($153)) {
   STACKTOP = sp;return;
  }
  $154 = +HEAPF64[$16>>3];
  $155 = $154 < 101.0;
  if (!($155)) {
   STACKTOP = sp;return;
  }
  $156 = +HEAPF64[$16>>3];
  $157 = (~~(($156)));
  $15 = $157;
  $158 = $15;
  $159 = (9480 + ($158<<2)|0);
  $160 = HEAP32[$159>>2]|0;
  $161 = ($160|0)!=(0);
  if ($161) {
   STACKTOP = sp;return;
  }
  $162 = $15;
  $163 = (9480 + ($162<<2)|0);
  HEAP32[$163>>2] = 1;
  $14 = 0;
  while(1) {
   $164 = $14;
   $165 = ($164|0)<(7);
   if (!($165)) {
    break;
   }
   $166 = $14;
   $167 = $12;
   $168 = (($167) + ($166<<2)|0);
   $169 = HEAP32[$168>>2]|0;
   $170 = $14;
   $171 = $15;
   $172 = (3824 + (($171*56)|0)|0);
   $173 = (($172) + ($170<<2)|0);
   HEAP32[$173>>2] = $169;
   $174 = $14;
   $175 = $13;
   $176 = (($175) + ($174<<2)|0);
   $177 = HEAP32[$176>>2]|0;
   $178 = $14;
   $179 = $15;
   $180 = (3824 + (($179*56)|0)|0);
   $181 = ((($180)) + 28|0);
   $182 = (($181) + ($178<<2)|0);
   HEAP32[$182>>2] = $177;
   $183 = $14;
   $184 = (($183) + 1)|0;
   $14 = $184;
  }
  STACKTOP = sp;return;
 }
 else if ((label|0) == 38) {
  STACKTOP = sp;return;
 }
}
function __Z4dropPdPiS0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $3;
 $8 = ((($7)) + 8|0);
 _memmove(($6|0),($8|0),32)|0;
 $9 = $4;
 $10 = $4;
 $11 = ((($10)) + 4|0);
 _memmove(($9|0),($11|0),16)|0;
 $12 = $5;
 $13 = HEAP32[$12>>2]|0;
 $14 = (($13) + -1)|0;
 HEAP32[$12>>2] = $14;
 STACKTOP = sp;return;
}
function __ZL11is_integrald($0) {
 $0 = +$0;
 var $1 = 0.0, $2 = 0.0, $3 = 0.0, $4 = 0.0, $5 = 0.0, $6 = 0.0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (+Math_abs((+$2)));
 $4 = (+Math_floor((+$3)));
 $5 = $1;
 $6 = (+Math_abs((+$5)));
 $7 = $4 == $6;
 $8 = $7&1;
 STACKTOP = sp;return ($8|0);
}
function __ZL9factoriald($0) {
 $0 = +$0;
 var $1 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0.0, $18 = 0.0, $2 = 0.0, $3 = 0, $4 = 0, $5 = 0.0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $2 = $0;
 $4 = 1;
 $5 = $2;
 $6 = $5 == 0.0;
 if ($6) {
  $1 = 1.0;
  $18 = $1;
  STACKTOP = sp;return (+$18);
 }
 $3 = 1;
 while(1) {
  $7 = $3;
  $8 = (+($7|0));
  $9 = $2;
  $10 = $8 <= $9;
  if (!($10)) {
   break;
  }
  $11 = $3;
  $12 = $4;
  $13 = Math_imul($12, $11)|0;
  $4 = $13;
  $14 = $3;
  $15 = (($14) + 1)|0;
  $3 = $15;
 }
 $16 = $4;
 $17 = (+($16|0));
 $1 = $17;
 $18 = $1;
 STACKTOP = sp;return (+$18);
}
function __Z11run_programiiii($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $9 = $4;
 HEAP32[952] = $9;
 $10 = $5;
 HEAP32[(3812)>>2] = $10;
 $11 = $6;
 HEAP32[(3816)>>2] = $11;
 $12 = $7;
 HEAP32[(3820)>>2] = $12;
 $8 = 0;
 while(1) {
  $13 = $8;
  $14 = ($13|0)<(4);
  if (!($14)) {
   label = 6;
   break;
  }
  $15 = $8;
  $16 = (3808 + ($15<<2)|0);
  $17 = HEAP32[$16>>2]|0;
  $18 = ($17|0)<(0);
  if ($18) {
   label = 10;
   break;
  }
  $19 = $8;
  $20 = (3808 + ($19<<2)|0);
  $21 = HEAP32[$20>>2]|0;
  $22 = ($21|0)>(9);
  if ($22) {
   label = 10;
   break;
  }
  $23 = $8;
  $24 = (($23) + 1)|0;
  $8 = $24;
 }
 if ((label|0) == 6) {
  $8 = 0;
  while(1) {
   $25 = $8;
   $26 = ($25|0)<(101);
   if (!($26)) {
    break;
   }
   $27 = $8;
   $28 = (9480 + ($27<<2)|0);
   HEAP32[$28>>2] = 0;
   $29 = $8;
   $30 = (($29) + 1)|0;
   $8 = $30;
  }
  __Z27permute_digits_and_evaluatev();
  STACKTOP = sp;return;
 }
 else if ((label|0) == 10) {
  STACKTOP = sp;return;
 }
}
function __Z14output_resultsv() {
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0;
 var $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0;
 var $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0;
 var $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0;
 var $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0;
 var $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0;
 var $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0;
 var $387 = 0, $388 = 0, $389 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 672|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(672|0);
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $124 = sp + 564|0;
 $125 = sp + 56|0;
 $128 = sp + 36|0;
 $129 = sp + 24|0;
 $130 = sp + 12|0;
 $123 = 0;
 $121 = $125;
 $131 = $121;
 $120 = $131;
 $132 = $120;
 $119 = $132;
 $133 = $119;
 $118 = $133;
 ;HEAP32[$133>>2]=0|0;HEAP32[$133+4>>2]=0|0;HEAP32[$133+8>>2]=0|0;
 $115 = $131;
 $134 = $115;
 $114 = $134;
 $135 = $114;
 $113 = $135;
 $136 = $113;
 $116 = $136;
 $117 = 0;
 while(1) {
  $137 = $117;
  $138 = ($137>>>0)<(3);
  if (!($138)) {
   break;
  }
  $139 = $117;
  $140 = $116;
  $141 = (($140) + ($139<<2)|0);
  HEAP32[$141>>2] = 0;
  $142 = $117;
  $143 = (($142) + 1)|0;
  $117 = $143;
 }
 $122 = 1;
 while(1) {
  $144 = $122;
  $145 = ($144|0)<=(100);
  if (!($145)) {
   label = 34;
   break;
  }
  $146 = $122;
  __THREW__ = 0;
  HEAP32[$vararg_buffer>>2] = $146;
  (invoke_iiii(43,($124|0),(675|0),($vararg_buffer|0))|0);
  $147 = __THREW__; __THREW__ = 0;
  $148 = $147&1;
  if ($148) {
   label = 19;
   break;
  }
  $111 = $128;
  $112 = $124;
  $149 = $111;
  $110 = $149;
  $150 = $110;
  $109 = $150;
  $151 = $109;
  $108 = $151;
  ;HEAP32[$151>>2]=0|0;HEAP32[$151+4>>2]=0|0;HEAP32[$151+8>>2]=0|0;
  $152 = $112;
  $153 = $112;
  __THREW__ = 0;
  $154 = (invoke_ii(41,($153|0))|0);
  $155 = __THREW__; __THREW__ = 0;
  $156 = $155&1;
  if ($156) {
   label = 19;
   break;
  }
  __THREW__ = 0;
  invoke_viii(44,($149|0),($152|0),($154|0));
  $157 = __THREW__; __THREW__ = 0;
  $158 = $157&1;
  if ($158) {
   label = 19;
   break;
  }
  $106 = $125;
  $107 = $128;
  $159 = $106;
  $160 = $107;
  $104 = $159;
  $105 = $160;
  $161 = $104;
  $162 = $105;
  $103 = $162;
  $163 = $103;
  $102 = $163;
  $164 = $102;
  $101 = $164;
  $165 = $101;
  $100 = $165;
  $166 = $100;
  $99 = $166;
  $167 = $99;
  $168 = ((($167)) + 11|0);
  $169 = HEAP8[$168>>0]|0;
  $170 = $169&255;
  $171 = $170 & 128;
  $172 = ($171|0)!=(0);
  if ($172) {
   $93 = $164;
   $173 = $93;
   $92 = $173;
   $174 = $92;
   $91 = $174;
   $175 = $91;
   $176 = HEAP32[$175>>2]|0;
   $182 = $176;
  } else {
   $98 = $164;
   $177 = $98;
   $97 = $177;
   $178 = $97;
   $96 = $178;
   $179 = $96;
   $95 = $179;
   $180 = $95;
   $94 = $180;
   $181 = $94;
   $182 = $181;
  }
  $90 = $182;
  $183 = $90;
  $184 = $105;
  $89 = $184;
  $185 = $89;
  $88 = $185;
  $186 = $88;
  $87 = $186;
  $187 = $87;
  $86 = $187;
  $188 = $86;
  $189 = ((($188)) + 11|0);
  $190 = HEAP8[$189>>0]|0;
  $191 = $190&255;
  $192 = $191 & 128;
  $193 = ($192|0)!=(0);
  if ($193) {
   $82 = $185;
   $194 = $82;
   $81 = $194;
   $195 = $81;
   $80 = $195;
   $196 = $80;
   $197 = ((($196)) + 4|0);
   $198 = HEAP32[$197>>2]|0;
   $205 = $198;
  } else {
   $85 = $185;
   $199 = $85;
   $84 = $199;
   $200 = $84;
   $83 = $200;
   $201 = $83;
   $202 = ((($201)) + 11|0);
   $203 = HEAP8[$202>>0]|0;
   $204 = $203&255;
   $205 = $204;
  }
  __THREW__ = 0;
  (invoke_iiii(40,($161|0),($183|0),($205|0))|0);
  $206 = __THREW__; __THREW__ = 0;
  $207 = $206&1;
  if ($207) {
   label = 20;
   break;
  }
  __THREW__ = 0;
  invoke_vi(29,($128|0));
  $208 = __THREW__; __THREW__ = 0;
  $209 = $208&1;
  if ($209) {
   label = 19;
   break;
  }
  $210 = $122;
  $211 = (9480 + ($210<<2)|0);
  $212 = HEAP32[$211>>2]|0;
  $213 = ($212|0)!=(0);
  if ($213) {
   $224 = $122;
   $225 = (3824 + (($224*56)|0)|0);
   $226 = $122;
   $227 = (3824 + (($226*56)|0)|0);
   $228 = ((($227)) + 28|0);
   __THREW__ = 0;
   invoke_viii(46,($129|0),($225|0),($228|0));
   $229 = __THREW__; __THREW__ = 0;
   $230 = $229&1;
   if ($230) {
    label = 19;
    break;
   }
   $76 = $125;
   $77 = $129;
   $231 = $76;
   $232 = $77;
   $74 = $231;
   $75 = $232;
   $233 = $74;
   $234 = $75;
   $73 = $234;
   $235 = $73;
   $72 = $235;
   $236 = $72;
   $71 = $236;
   $237 = $71;
   $70 = $237;
   $238 = $70;
   $69 = $238;
   $239 = $69;
   $240 = ((($239)) + 11|0);
   $241 = HEAP8[$240>>0]|0;
   $242 = $241&255;
   $243 = $242 & 128;
   $244 = ($243|0)!=(0);
   if ($244) {
    $63 = $236;
    $245 = $63;
    $62 = $245;
    $246 = $62;
    $61 = $246;
    $247 = $61;
    $248 = HEAP32[$247>>2]|0;
    $254 = $248;
   } else {
    $68 = $236;
    $249 = $68;
    $67 = $249;
    $250 = $67;
    $66 = $250;
    $251 = $66;
    $65 = $251;
    $252 = $65;
    $64 = $252;
    $253 = $64;
    $254 = $253;
   }
   $60 = $254;
   $255 = $60;
   $256 = $75;
   $59 = $256;
   $257 = $59;
   $58 = $257;
   $258 = $58;
   $57 = $258;
   $259 = $57;
   $56 = $259;
   $260 = $56;
   $261 = ((($260)) + 11|0);
   $262 = HEAP8[$261>>0]|0;
   $263 = $262&255;
   $264 = $263 & 128;
   $265 = ($264|0)!=(0);
   if ($265) {
    $52 = $257;
    $266 = $52;
    $51 = $266;
    $267 = $51;
    $50 = $267;
    $268 = $50;
    $269 = ((($268)) + 4|0);
    $270 = HEAP32[$269>>2]|0;
    $277 = $270;
   } else {
    $55 = $257;
    $271 = $55;
    $54 = $271;
    $272 = $54;
    $53 = $272;
    $273 = $53;
    $274 = ((($273)) + 11|0);
    $275 = HEAP8[$274>>0]|0;
    $276 = $275&255;
    $277 = $276;
   }
   __THREW__ = 0;
   (invoke_iiii(40,($233|0),($255|0),($277|0))|0);
   $278 = __THREW__; __THREW__ = 0;
   $279 = $278&1;
   if ($279) {
    label = 32;
    break;
   }
   __THREW__ = 0;
   invoke_vi(29,($129|0));
   $280 = __THREW__; __THREW__ = 0;
   $281 = $280&1;
   if ($281) {
    label = 19;
    break;
   }
   $48 = $125;
   $49 = 644;
   $282 = $48;
   $283 = $49;
   __THREW__ = 0;
   (invoke_iii(45,($282|0),($283|0))|0);
   $284 = __THREW__; __THREW__ = 0;
   $285 = $284&1;
   if ($285) {
    label = 19;
    break;
   }
   $286 = $123;
   $287 = (($286) + 1)|0;
   $123 = $287;
  } else {
   $78 = $125;
   $79 = 681;
   $214 = $78;
   $215 = $79;
   __THREW__ = 0;
   (invoke_iii(45,($214|0),($215|0))|0);
   $216 = __THREW__; __THREW__ = 0;
   $217 = $216&1;
   if ($217) {
    label = 19;
    break;
   }
  }
  $292 = $122;
  $293 = (($292) + 1)|0;
  $122 = $293;
 }
 do {
  if ((label|0) == 20) {
   $220 = ___cxa_find_matching_catch_2()|0;
   $221 = tempRet0;
   $126 = $220;
   $127 = $221;
   __THREW__ = 0;
   invoke_vi(29,($128|0));
   $222 = __THREW__; __THREW__ = 0;
   $223 = $222&1;
   if ($223) {
    $388 = ___cxa_find_matching_catch_3(0|0)|0;
    $389 = tempRet0;
    ___clang_call_terminate($388);
    // unreachable;
   }
  }
  else if ((label|0) == 32) {
   $288 = ___cxa_find_matching_catch_2()|0;
   $289 = tempRet0;
   $126 = $288;
   $127 = $289;
   __THREW__ = 0;
   invoke_vi(29,($129|0));
   $290 = __THREW__; __THREW__ = 0;
   $291 = $290&1;
   if ($291) {
    $388 = ___cxa_find_matching_catch_3(0|0)|0;
    $389 = tempRet0;
    ___clang_call_terminate($388);
    // unreachable;
   }
  }
  else if ((label|0) == 34) {
   $294 = $123;
   __THREW__ = 0;
   HEAP32[$vararg_buffer1>>2] = $294;
   (invoke_iiii(43,($124|0),(700|0),($vararg_buffer1|0))|0);
   $295 = __THREW__; __THREW__ = 0;
   $296 = $295&1;
   if ($296) {
    label = 19;
   } else {
    $46 = $130;
    $47 = $124;
    $297 = $46;
    $45 = $297;
    $298 = $45;
    $44 = $298;
    $299 = $44;
    $43 = $299;
    ;HEAP32[$299>>2]=0|0;HEAP32[$299+4>>2]=0|0;HEAP32[$299+8>>2]=0|0;
    $300 = $47;
    $301 = $47;
    __THREW__ = 0;
    $302 = (invoke_ii(41,($301|0))|0);
    $303 = __THREW__; __THREW__ = 0;
    $304 = $303&1;
    if ($304) {
     label = 19;
    } else {
     __THREW__ = 0;
     invoke_viii(44,($297|0),($300|0),($302|0));
     $305 = __THREW__; __THREW__ = 0;
     $306 = $305&1;
     if ($306) {
      label = 19;
     } else {
      $41 = $125;
      $42 = $130;
      $307 = $41;
      $308 = $42;
      $39 = $307;
      $40 = $308;
      $309 = $39;
      $310 = $40;
      $38 = $310;
      $311 = $38;
      $37 = $311;
      $312 = $37;
      $36 = $312;
      $313 = $36;
      $35 = $313;
      $314 = $35;
      $34 = $314;
      $315 = $34;
      $316 = ((($315)) + 11|0);
      $317 = HEAP8[$316>>0]|0;
      $318 = $317&255;
      $319 = $318 & 128;
      $320 = ($319|0)!=(0);
      if ($320) {
       $28 = $312;
       $321 = $28;
       $27 = $321;
       $322 = $27;
       $26 = $322;
       $323 = $26;
       $324 = HEAP32[$323>>2]|0;
       $330 = $324;
      } else {
       $33 = $312;
       $325 = $33;
       $32 = $325;
       $326 = $32;
       $31 = $326;
       $327 = $31;
       $30 = $327;
       $328 = $30;
       $29 = $328;
       $329 = $29;
       $330 = $329;
      }
      $25 = $330;
      $331 = $25;
      $332 = $40;
      $24 = $332;
      $333 = $24;
      $23 = $333;
      $334 = $23;
      $22 = $334;
      $335 = $22;
      $21 = $335;
      $336 = $21;
      $337 = ((($336)) + 11|0);
      $338 = HEAP8[$337>>0]|0;
      $339 = $338&255;
      $340 = $339 & 128;
      $341 = ($340|0)!=(0);
      if ($341) {
       $17 = $333;
       $342 = $17;
       $16 = $342;
       $343 = $16;
       $15 = $343;
       $344 = $15;
       $345 = ((($344)) + 4|0);
       $346 = HEAP32[$345>>2]|0;
       $353 = $346;
      } else {
       $20 = $333;
       $347 = $20;
       $19 = $347;
       $348 = $19;
       $18 = $348;
       $349 = $18;
       $350 = ((($349)) + 11|0);
       $351 = HEAP8[$350>>0]|0;
       $352 = $351&255;
       $353 = $352;
      }
      __THREW__ = 0;
      (invoke_iiii(40,($309|0),($331|0),($353|0))|0);
      $354 = __THREW__; __THREW__ = 0;
      $355 = $354&1;
      if ($355) {
       $380 = ___cxa_find_matching_catch_2()|0;
       $381 = tempRet0;
       $126 = $380;
       $127 = $381;
       __THREW__ = 0;
       invoke_vi(29,($130|0));
       $382 = __THREW__; __THREW__ = 0;
       $383 = $382&1;
       if (!($383)) {
        break;
       }
       $388 = ___cxa_find_matching_catch_3(0|0)|0;
       $389 = tempRet0;
       ___clang_call_terminate($388);
       // unreachable;
      }
      __THREW__ = 0;
      invoke_vi(29,($130|0));
      $356 = __THREW__; __THREW__ = 0;
      $357 = $356&1;
      if ($357) {
       label = 19;
      } else {
       $14 = $125;
       $358 = $14;
       $13 = $358;
       $359 = $13;
       $12 = $359;
       $360 = $12;
       $11 = $360;
       $361 = $11;
       $10 = $361;
       $362 = $10;
       $9 = $362;
       $363 = $9;
       $364 = ((($363)) + 11|0);
       $365 = HEAP8[$364>>0]|0;
       $366 = $365&255;
       $367 = $366 & 128;
       $368 = ($367|0)!=(0);
       if ($368) {
        $3 = $360;
        $369 = $3;
        $2 = $369;
        $370 = $2;
        $1 = $370;
        $371 = $1;
        $372 = HEAP32[$371>>2]|0;
        $378 = $372;
        $0 = $378;
        $379 = $0;
        __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($125);
        STACKTOP = sp;return ($379|0);
       } else {
        $8 = $360;
        $373 = $8;
        $7 = $373;
        $374 = $7;
        $6 = $374;
        $375 = $6;
        $5 = $375;
        $376 = $5;
        $4 = $376;
        $377 = $4;
        $378 = $377;
        $0 = $378;
        $379 = $0;
        __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($125);
        STACKTOP = sp;return ($379|0);
       }
      }
     }
    }
   }
  }
 } while(0);
 if ((label|0) == 19) {
  $218 = ___cxa_find_matching_catch_2()|0;
  $219 = tempRet0;
  $126 = $218;
  $127 = $219;
 }
 __THREW__ = 0;
 invoke_vi(29,($125|0));
 $384 = __THREW__; __THREW__ = 0;
 $385 = $384&1;
 if ($385) {
  $388 = ___cxa_find_matching_catch_3(0|0)|0;
  $389 = tempRet0;
  ___clang_call_terminate($388);
  // unreachable;
 } else {
  $386 = $126;
  $387 = $127;
  ___resumeException($386|0);
  // unreachable;
 }
 return (0)|0;
}
function _solve_wgyn($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $4;
 $9 = $5;
 $10 = $6;
 $11 = $7;
 __Z11run_programiiii($8,$9,$10,$11);
 $12 = (__Z14output_resultsv()|0);
 STACKTOP = sp;return ($12|0);
}
function __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $13 = $0;
 $16 = $13;
 __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE5clearEv($16);
 $12 = $16;
 $17 = $12;
 $18 = ((($17)) + 4|0);
 $19 = HEAP32[$18>>2]|0;
 $14 = $19;
 $11 = $16;
 $20 = $11;
 $21 = ((($20)) + 8|0);
 $22 = HEAP32[$21>>2]|0;
 $15 = $22;
 while(1) {
  $23 = $14;
  $24 = $15;
  $25 = ($23|0)!=($24|0);
  if (!($25)) {
   break;
  }
  $10 = $16;
  $26 = $10;
  $27 = ((($26)) + 20|0);
  $9 = $27;
  $28 = $9;
  $8 = $28;
  $29 = $8;
  $30 = $14;
  $31 = HEAP32[$30>>2]|0;
  $5 = $29;
  $6 = $31;
  $7 = 341;
  $32 = $5;
  $33 = $6;
  $34 = $7;
  $2 = $32;
  $3 = $33;
  $4 = $34;
  $35 = $3;
  $1 = $35;
  $36 = $1;
  __ZdlPv($36);
  $37 = $14;
  $38 = ((($37)) + 4|0);
  $14 = $38;
 }
 __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS7_EEED2Ev($16);
 STACKTOP = sp;return;
}
function __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE5clearEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0;
 var $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0;
 var $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0;
 var $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0;
 var $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 192|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(192|0);
 $5 = sp + 8|0;
 $8 = sp + 177|0;
 $28 = sp;
 $31 = sp + 176|0;
 $41 = sp + 24|0;
 $42 = sp + 16|0;
 $37 = $0;
 $43 = $37;
 $36 = $43;
 $44 = $36;
 $45 = ((($44)) + 20|0);
 $35 = $45;
 $46 = $35;
 $34 = $46;
 $47 = $34;
 $38 = $47;
 __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE5beginEv($41,$43);
 __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE3endEv($42,$43);
 while(1) {
  $17 = $41;
  $18 = $42;
  $48 = $17;
  $49 = $18;
  $15 = $48;
  $16 = $49;
  $50 = $15;
  $51 = ((($50)) + 4|0);
  $52 = HEAP32[$51>>2]|0;
  $53 = $16;
  $54 = ((($53)) + 4|0);
  $55 = HEAP32[$54>>2]|0;
  $56 = ($52|0)==($55|0);
  $57 = $56 ^ 1;
  if (!($57)) {
   break;
  }
  $58 = $38;
  $2 = $41;
  $59 = $2;
  $60 = ((($59)) + 4|0);
  $61 = HEAP32[$60>>2]|0;
  $1 = $61;
  $62 = $1;
  $6 = $58;
  $7 = $62;
  $63 = $6;
  $64 = $7;
  ;HEAP8[$5>>0]=HEAP8[$8>>0]|0;
  $3 = $63;
  $4 = $64;
  $65 = $4;
  __THREW__ = 0;
  invoke_vi(29,($65|0));
  $66 = __THREW__; __THREW__ = 0;
  $67 = $66&1;
  if ($67) {
   label = 6;
   break;
  }
  $9 = $41;
  $68 = $9;
  $69 = ((($68)) + 4|0);
  $70 = HEAP32[$69>>2]|0;
  $71 = ((($70)) + 12|0);
  HEAP32[$69>>2] = $71;
  $72 = HEAP32[$68>>2]|0;
  $73 = HEAP32[$72>>2]|0;
  $74 = $71;
  $75 = $73;
  $76 = (($74) - ($75))|0;
  $77 = (($76|0) / 12)&-1;
  $78 = ($77|0)==(341);
  if (!($78)) {
   continue;
  }
  $79 = HEAP32[$68>>2]|0;
  $80 = ((($79)) + 4|0);
  HEAP32[$68>>2] = $80;
  $81 = HEAP32[$68>>2]|0;
  $82 = HEAP32[$81>>2]|0;
  $83 = ((($68)) + 4|0);
  HEAP32[$83>>2] = $82;
 }
 if ((label|0) == 6) {
  $84 = ___cxa_find_matching_catch_2()|0;
  $85 = tempRet0;
  $39 = $84;
  $40 = $85;
  $86 = $39;
  ___cxa_call_unexpected(($86|0));
  // unreachable;
 }
 $12 = $43;
 $87 = $12;
 $88 = ((($87)) + 20|0);
 $11 = $88;
 $89 = $11;
 $10 = $89;
 $90 = $10;
 HEAP32[$90>>2] = 0;
 while(1) {
  $13 = $43;
  $91 = $13;
  $92 = ((($91)) + 8|0);
  $93 = HEAP32[$92>>2]|0;
  $94 = ((($91)) + 4|0);
  $95 = HEAP32[$94>>2]|0;
  $96 = $93;
  $97 = $95;
  $98 = (($96) - ($97))|0;
  $99 = (($98|0) / 4)&-1;
  $100 = ($99>>>0)>(2);
  if (!($100)) {
   break;
  }
  $101 = $38;
  $14 = $43;
  $102 = $14;
  $103 = ((($102)) + 4|0);
  $104 = HEAP32[$103>>2]|0;
  $105 = HEAP32[$104>>2]|0;
  $23 = $101;
  $24 = $105;
  $25 = 341;
  $106 = $23;
  $107 = $24;
  $108 = $25;
  $20 = $106;
  $21 = $107;
  $22 = $108;
  $109 = $21;
  $19 = $109;
  $110 = $19;
  __ZdlPv($110);
  $32 = $43;
  $111 = $32;
  $112 = ((($111)) + 4|0);
  $113 = HEAP32[$112>>2]|0;
  $114 = ((($113)) + 4|0);
  $29 = $111;
  $30 = $114;
  $115 = $29;
  $116 = $30;
  ;HEAP8[$28>>0]=HEAP8[$31>>0]|0;
  $26 = $115;
  $27 = $116;
  $117 = $26;
  $118 = $27;
  $119 = ((($117)) + 4|0);
  HEAP32[$119>>2] = $118;
 }
 $33 = $43;
 $120 = $33;
 $121 = ((($120)) + 8|0);
 $122 = HEAP32[$121>>2]|0;
 $123 = ((($120)) + 4|0);
 $124 = HEAP32[$123>>2]|0;
 $125 = $122;
 $126 = $124;
 $127 = (($125) - ($126))|0;
 $128 = (($127|0) / 4)&-1;
 switch ($128|0) {
 case 1:  {
  $129 = ((($43)) + 16|0);
  HEAP32[$129>>2] = 170;
  STACKTOP = sp;return;
  break;
 }
 case 2:  {
  $130 = ((($43)) + 16|0);
  HEAP32[$130>>2] = 341;
  STACKTOP = sp;return;
  break;
 }
 default: {
  STACKTOP = sp;return;
 }
 }
}
function __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS7_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $18 = sp + 8|0;
 $21 = sp + 125|0;
 $27 = sp;
 $30 = sp + 124|0;
 $32 = $0;
 $33 = $32;
 $31 = $33;
 $34 = $31;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 $28 = $34;
 $29 = $36;
 $37 = $28;
 $38 = $29;
 ;HEAP8[$27>>0]=HEAP8[$30>>0]|0;
 $25 = $37;
 $26 = $38;
 $39 = $25;
 while(1) {
  $40 = $26;
  $41 = ((($39)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = ($40|0)!=($42|0);
  if (!($43)) {
   break;
  }
  $24 = $39;
  $44 = $24;
  $45 = ((($44)) + 12|0);
  $23 = $45;
  $46 = $23;
  $22 = $46;
  $47 = $22;
  $48 = ((($39)) + 8|0);
  $49 = HEAP32[$48>>2]|0;
  $50 = ((($49)) + -4|0);
  HEAP32[$48>>2] = $50;
  $15 = $50;
  $51 = $15;
  $19 = $47;
  $20 = $51;
  $52 = $19;
  $53 = $20;
  ;HEAP8[$18>>0]=HEAP8[$21>>0]|0;
  $16 = $52;
  $17 = $53;
 }
 $54 = HEAP32[$33>>2]|0;
 $55 = ($54|0)!=(0|0);
 if (!($55)) {
  STACKTOP = sp;return;
 }
 $7 = $33;
 $56 = $7;
 $57 = ((($56)) + 12|0);
 $6 = $57;
 $58 = $6;
 $5 = $58;
 $59 = $5;
 $60 = HEAP32[$33>>2]|0;
 $4 = $33;
 $61 = $4;
 $3 = $61;
 $62 = $3;
 $63 = ((($62)) + 12|0);
 $2 = $63;
 $64 = $2;
 $1 = $64;
 $65 = $1;
 $66 = HEAP32[$65>>2]|0;
 $67 = HEAP32[$61>>2]|0;
 $68 = $66;
 $69 = $67;
 $70 = (($68) - ($69))|0;
 $71 = (($70|0) / 4)&-1;
 $12 = $59;
 $13 = $60;
 $14 = $71;
 $72 = $12;
 $73 = $13;
 $74 = $14;
 $9 = $72;
 $10 = $73;
 $11 = $74;
 $75 = $10;
 $8 = $75;
 $76 = $8;
 __ZdlPv($76);
 STACKTOP = sp;return;
}
function __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE5beginEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = $1;
 $9 = $7;
 $6 = $9;
 $10 = $6;
 $11 = ((($10)) + 4|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($9)) + 16|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = (($14>>>0) / 341)&-1;
 $16 = (($12) + ($15<<2)|0);
 $8 = $16;
 $17 = $8;
 $2 = $9;
 $18 = $2;
 $19 = ((($18)) + 8|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($18)) + 4|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ($20|0)==($22|0);
 if ($23) {
  $30 = 0;
 } else {
  $24 = $8;
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($9)) + 16|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = (($27>>>0) % 341)&-1;
  $29 = (($25) + (($28*12)|0)|0);
  $30 = $29;
 }
 $3 = $0;
 $4 = $17;
 $5 = $30;
 $31 = $3;
 $32 = $4;
 HEAP32[$31>>2] = $32;
 $33 = ((($31)) + 4|0);
 $34 = $5;
 HEAP32[$33>>2] = $34;
 STACKTOP = sp;return;
}
function __ZNSt3__212__deque_baseINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE3endEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $10 = $1;
 $13 = $10;
 $9 = $13;
 $14 = $9;
 $15 = ((($14)) + 20|0);
 $8 = $15;
 $16 = $8;
 $7 = $16;
 $17 = $7;
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($13)) + 16|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = (($18) + ($20))|0;
 $11 = $21;
 $2 = $13;
 $22 = $2;
 $23 = ((($22)) + 4|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = $11;
 $26 = (($25>>>0) / 341)&-1;
 $27 = (($24) + ($26<<2)|0);
 $12 = $27;
 $28 = $12;
 $3 = $13;
 $29 = $3;
 $30 = ((($29)) + 8|0);
 $31 = HEAP32[$30>>2]|0;
 $32 = ((($29)) + 4|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = ($31|0)==($33|0);
 if ($34) {
  $40 = 0;
  $4 = $0;
  $5 = $28;
  $6 = $40;
  $41 = $4;
  $42 = $5;
  HEAP32[$41>>2] = $42;
  $43 = ((($41)) + 4|0);
  $44 = $6;
  HEAP32[$43>>2] = $44;
  STACKTOP = sp;return;
 }
 $35 = $12;
 $36 = HEAP32[$35>>2]|0;
 $37 = $11;
 $38 = (($37>>>0) % 341)&-1;
 $39 = (($36) + (($38*12)|0)|0);
 $40 = $39;
 $4 = $0;
 $5 = $28;
 $6 = $40;
 $41 = $4;
 $42 = $5;
 HEAP32[$41>>2] = $42;
 $43 = ((($41)) + 4|0);
 $44 = $6;
 HEAP32[$43>>2] = $44;
 STACKTOP = sp;return;
}
function __ZNSt3__212__deque_baseIiNS_9allocatorIiEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $13 = $0;
 $16 = $13;
 __ZNSt3__212__deque_baseIiNS_9allocatorIiEEE5clearEv($16);
 $12 = $16;
 $17 = $12;
 $18 = ((($17)) + 4|0);
 $19 = HEAP32[$18>>2]|0;
 $14 = $19;
 $11 = $16;
 $20 = $11;
 $21 = ((($20)) + 8|0);
 $22 = HEAP32[$21>>2]|0;
 $15 = $22;
 while(1) {
  $23 = $14;
  $24 = $15;
  $25 = ($23|0)!=($24|0);
  if (!($25)) {
   break;
  }
  $10 = $16;
  $26 = $10;
  $27 = ((($26)) + 20|0);
  $9 = $27;
  $28 = $9;
  $8 = $28;
  $29 = $8;
  $30 = $14;
  $31 = HEAP32[$30>>2]|0;
  $5 = $29;
  $6 = $31;
  $7 = 1024;
  $32 = $5;
  $33 = $6;
  $34 = $7;
  $2 = $32;
  $3 = $33;
  $4 = $34;
  $35 = $3;
  $1 = $35;
  $36 = $1;
  __ZdlPv($36);
  $37 = $14;
  $38 = ((($37)) + 4|0);
  $14 = $38;
 }
 __ZNSt3__214__split_bufferIPiNS_9allocatorIS1_EEED2Ev($16);
 STACKTOP = sp;return;
}
function __ZNSt3__212__deque_baseIiNS_9allocatorIiEEE5clearEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0;
 var $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 176|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(176|0);
 $5 = sp + 8|0;
 $8 = sp + 169|0;
 $28 = sp;
 $31 = sp + 168|0;
 $39 = sp + 24|0;
 $40 = sp + 16|0;
 $37 = $0;
 $41 = $37;
 $36 = $41;
 $42 = $36;
 $43 = ((($42)) + 20|0);
 $35 = $43;
 $44 = $35;
 $34 = $44;
 $45 = $34;
 $38 = $45;
 __ZNSt3__212__deque_baseIiNS_9allocatorIiEEE5beginEv($39,$41);
 __ZNSt3__212__deque_baseIiNS_9allocatorIiEEE3endEv($40,$41);
 while(1) {
  $17 = $39;
  $18 = $40;
  $46 = $17;
  $47 = $18;
  $15 = $46;
  $16 = $47;
  $48 = $15;
  $49 = ((($48)) + 4|0);
  $50 = HEAP32[$49>>2]|0;
  $51 = $16;
  $52 = ((($51)) + 4|0);
  $53 = HEAP32[$52>>2]|0;
  $54 = ($50|0)==($53|0);
  $55 = $54 ^ 1;
  if (!($55)) {
   break;
  }
  $56 = $38;
  $1 = $39;
  $57 = $1;
  $58 = ((($57)) + 4|0);
  $59 = HEAP32[$58>>2]|0;
  $2 = $59;
  $60 = $2;
  $6 = $56;
  $7 = $60;
  $61 = $6;
  $62 = $7;
  ;HEAP8[$5>>0]=HEAP8[$8>>0]|0;
  $3 = $61;
  $4 = $62;
  $9 = $39;
  $63 = $9;
  $64 = ((($63)) + 4|0);
  $65 = HEAP32[$64>>2]|0;
  $66 = ((($65)) + 4|0);
  HEAP32[$64>>2] = $66;
  $67 = HEAP32[$63>>2]|0;
  $68 = HEAP32[$67>>2]|0;
  $69 = $66;
  $70 = $68;
  $71 = (($69) - ($70))|0;
  $72 = (($71|0) / 4)&-1;
  $73 = ($72|0)==(1024);
  if (!($73)) {
   continue;
  }
  $74 = HEAP32[$63>>2]|0;
  $75 = ((($74)) + 4|0);
  HEAP32[$63>>2] = $75;
  $76 = HEAP32[$63>>2]|0;
  $77 = HEAP32[$76>>2]|0;
  $78 = ((($63)) + 4|0);
  HEAP32[$78>>2] = $77;
 }
 $12 = $41;
 $79 = $12;
 $80 = ((($79)) + 20|0);
 $11 = $80;
 $81 = $11;
 $10 = $81;
 $82 = $10;
 HEAP32[$82>>2] = 0;
 while(1) {
  $13 = $41;
  $83 = $13;
  $84 = ((($83)) + 8|0);
  $85 = HEAP32[$84>>2]|0;
  $86 = ((($83)) + 4|0);
  $87 = HEAP32[$86>>2]|0;
  $88 = $85;
  $89 = $87;
  $90 = (($88) - ($89))|0;
  $91 = (($90|0) / 4)&-1;
  $92 = ($91>>>0)>(2);
  if (!($92)) {
   break;
  }
  $93 = $38;
  $14 = $41;
  $94 = $14;
  $95 = ((($94)) + 4|0);
  $96 = HEAP32[$95>>2]|0;
  $97 = HEAP32[$96>>2]|0;
  $23 = $93;
  $24 = $97;
  $25 = 1024;
  $98 = $23;
  $99 = $24;
  $100 = $25;
  $20 = $98;
  $21 = $99;
  $22 = $100;
  $101 = $21;
  $19 = $101;
  $102 = $19;
  __ZdlPv($102);
  $32 = $41;
  $103 = $32;
  $104 = ((($103)) + 4|0);
  $105 = HEAP32[$104>>2]|0;
  $106 = ((($105)) + 4|0);
  $29 = $103;
  $30 = $106;
  $107 = $29;
  $108 = $30;
  ;HEAP8[$28>>0]=HEAP8[$31>>0]|0;
  $26 = $107;
  $27 = $108;
  $109 = $26;
  $110 = $27;
  $111 = ((($109)) + 4|0);
  HEAP32[$111>>2] = $110;
 }
 $33 = $41;
 $112 = $33;
 $113 = ((($112)) + 8|0);
 $114 = HEAP32[$113>>2]|0;
 $115 = ((($112)) + 4|0);
 $116 = HEAP32[$115>>2]|0;
 $117 = $114;
 $118 = $116;
 $119 = (($117) - ($118))|0;
 $120 = (($119|0) / 4)&-1;
 switch ($120|0) {
 case 1:  {
  $121 = ((($41)) + 16|0);
  HEAP32[$121>>2] = 512;
  STACKTOP = sp;return;
  break;
 }
 case 2:  {
  $122 = ((($41)) + 16|0);
  HEAP32[$122>>2] = 1024;
  STACKTOP = sp;return;
  break;
 }
 default: {
  STACKTOP = sp;return;
 }
 }
}
function __ZNSt3__214__split_bufferIPiNS_9allocatorIS1_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $18 = sp + 8|0;
 $21 = sp + 125|0;
 $27 = sp;
 $30 = sp + 124|0;
 $32 = $0;
 $33 = $32;
 $31 = $33;
 $34 = $31;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 $28 = $34;
 $29 = $36;
 $37 = $28;
 $38 = $29;
 ;HEAP8[$27>>0]=HEAP8[$30>>0]|0;
 $25 = $37;
 $26 = $38;
 $39 = $25;
 while(1) {
  $40 = $26;
  $41 = ((($39)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = ($40|0)!=($42|0);
  if (!($43)) {
   break;
  }
  $24 = $39;
  $44 = $24;
  $45 = ((($44)) + 12|0);
  $23 = $45;
  $46 = $23;
  $22 = $46;
  $47 = $22;
  $48 = ((($39)) + 8|0);
  $49 = HEAP32[$48>>2]|0;
  $50 = ((($49)) + -4|0);
  HEAP32[$48>>2] = $50;
  $15 = $50;
  $51 = $15;
  $19 = $47;
  $20 = $51;
  $52 = $19;
  $53 = $20;
  ;HEAP8[$18>>0]=HEAP8[$21>>0]|0;
  $16 = $52;
  $17 = $53;
 }
 $54 = HEAP32[$33>>2]|0;
 $55 = ($54|0)!=(0|0);
 if (!($55)) {
  STACKTOP = sp;return;
 }
 $7 = $33;
 $56 = $7;
 $57 = ((($56)) + 12|0);
 $6 = $57;
 $58 = $6;
 $5 = $58;
 $59 = $5;
 $60 = HEAP32[$33>>2]|0;
 $4 = $33;
 $61 = $4;
 $3 = $61;
 $62 = $3;
 $63 = ((($62)) + 12|0);
 $2 = $63;
 $64 = $2;
 $1 = $64;
 $65 = $1;
 $66 = HEAP32[$65>>2]|0;
 $67 = HEAP32[$61>>2]|0;
 $68 = $66;
 $69 = $67;
 $70 = (($68) - ($69))|0;
 $71 = (($70|0) / 4)&-1;
 $12 = $59;
 $13 = $60;
 $14 = $71;
 $72 = $12;
 $73 = $13;
 $74 = $14;
 $9 = $72;
 $10 = $73;
 $11 = $74;
 $75 = $10;
 $8 = $75;
 $76 = $8;
 __ZdlPv($76);
 STACKTOP = sp;return;
}
function __ZNSt3__212__deque_baseIiNS_9allocatorIiEEE5beginEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = $1;
 $9 = $7;
 $6 = $9;
 $10 = $6;
 $11 = ((($10)) + 4|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = ((($9)) + 16|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = (($14>>>0) / 1024)&-1;
 $16 = (($12) + ($15<<2)|0);
 $8 = $16;
 $17 = $8;
 $2 = $9;
 $18 = $2;
 $19 = ((($18)) + 8|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ((($18)) + 4|0);
 $22 = HEAP32[$21>>2]|0;
 $23 = ($20|0)==($22|0);
 if ($23) {
  $30 = 0;
 } else {
  $24 = $8;
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($9)) + 16|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = (($27>>>0) % 1024)&-1;
  $29 = (($25) + ($28<<2)|0);
  $30 = $29;
 }
 $3 = $0;
 $4 = $17;
 $5 = $30;
 $31 = $3;
 $32 = $4;
 HEAP32[$31>>2] = $32;
 $33 = ((($31)) + 4|0);
 $34 = $5;
 HEAP32[$33>>2] = $34;
 STACKTOP = sp;return;
}
function __ZNSt3__212__deque_baseIiNS_9allocatorIiEEE3endEv($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $10 = $1;
 $13 = $10;
 $9 = $13;
 $14 = $9;
 $15 = ((($14)) + 20|0);
 $8 = $15;
 $16 = $8;
 $7 = $16;
 $17 = $7;
 $18 = HEAP32[$17>>2]|0;
 $19 = ((($13)) + 16|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = (($18) + ($20))|0;
 $11 = $21;
 $2 = $13;
 $22 = $2;
 $23 = ((($22)) + 4|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = $11;
 $26 = (($25>>>0) / 1024)&-1;
 $27 = (($24) + ($26<<2)|0);
 $12 = $27;
 $28 = $12;
 $3 = $13;
 $29 = $3;
 $30 = ((($29)) + 8|0);
 $31 = HEAP32[$30>>2]|0;
 $32 = ((($29)) + 4|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = ($31|0)==($33|0);
 if ($34) {
  $40 = 0;
  $4 = $0;
  $5 = $28;
  $6 = $40;
  $41 = $4;
  $42 = $5;
  HEAP32[$41>>2] = $42;
  $43 = ((($41)) + 4|0);
  $44 = $6;
  HEAP32[$43>>2] = $44;
  STACKTOP = sp;return;
 }
 $35 = $12;
 $36 = HEAP32[$35>>2]|0;
 $37 = $11;
 $38 = (($37>>>0) % 1024)&-1;
 $39 = (($36) + ($38<<2)|0);
 $40 = $39;
 $4 = $0;
 $5 = $28;
 $6 = $40;
 $41 = $4;
 $42 = $5;
 HEAP32[$41>>2] = $42;
 $43 = ((($41)) + 4|0);
 $44 = $6;
 HEAP32[$43>>2] = $44;
 STACKTOP = sp;return;
}
function __ZNSt3__211char_traitsIcE6lengthEPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (_strlen($2)|0);
 STACKTOP = sp;return ($3|0);
}
function __ZNSt3__25dequeINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE20__add_front_capacityEv($0) {
 $0 = $0|0;
 var $$byval_copy = 0, $$byval_copy10 = 0, $$byval_copy11 = 0, $$byval_copy12 = 0, $$byval_copy8 = 0, $$byval_copy9 = 0, $$index = 0, $$index3 = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0;
 var $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0;
 var $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0;
 var $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0, $1062 = 0;
 var $1063 = 0, $1064 = 0, $1065 = 0, $1066 = 0, $1067 = 0, $1068 = 0, $1069 = 0, $107 = 0, $1070 = 0, $1071 = 0, $1072 = 0, $1073 = 0, $1074 = 0, $1075 = 0, $1076 = 0, $1077 = 0, $1078 = 0, $1079 = 0, $108 = 0, $1080 = 0;
 var $1081 = 0, $1082 = 0, $1083 = 0, $1084 = 0, $1085 = 0, $1086 = 0, $1087 = 0, $1088 = 0, $1089 = 0, $109 = 0, $1090 = 0, $1091 = 0, $1092 = 0, $1093 = 0, $1094 = 0, $1095 = 0, $1096 = 0, $1097 = 0, $1098 = 0, $1099 = 0;
 var $11 = 0, $110 = 0, $1100 = 0, $1101 = 0, $1102 = 0, $1103 = 0, $1104 = 0, $1105 = 0, $1106 = 0, $1107 = 0, $1108 = 0, $1109 = 0, $111 = 0, $1110 = 0, $1111 = 0, $1112 = 0, $1113 = 0, $1114 = 0, $1115 = 0, $1116 = 0;
 var $1117 = 0, $1118 = 0, $1119 = 0, $112 = 0, $1120 = 0, $1121 = 0, $1122 = 0, $1123 = 0, $1124 = 0, $1125 = 0, $1126 = 0, $1127 = 0, $1128 = 0, $1129 = 0, $113 = 0, $1130 = 0, $1131 = 0, $1132 = 0, $1133 = 0, $1134 = 0;
 var $1135 = 0, $1136 = 0, $1137 = 0, $1138 = 0, $1139 = 0, $114 = 0, $1140 = 0, $1141 = 0, $1142 = 0, $1143 = 0, $1144 = 0, $1145 = 0, $1146 = 0, $1147 = 0, $1148 = 0, $1149 = 0, $115 = 0, $1150 = 0, $1151 = 0, $1152 = 0;
 var $1153 = 0, $1154 = 0, $1155 = 0, $1156 = 0, $1157 = 0, $1158 = 0, $1159 = 0, $116 = 0, $1160 = 0, $1161 = 0, $1162 = 0, $1163 = 0, $1164 = 0, $1165 = 0, $1166 = 0, $1167 = 0, $1168 = 0, $1169 = 0, $117 = 0, $1170 = 0;
 var $1171 = 0, $1172 = 0, $1173 = 0, $1174 = 0, $1175 = 0, $1176 = 0, $1177 = 0, $1178 = 0, $1179 = 0, $118 = 0, $1180 = 0, $1181 = 0, $1182 = 0, $1183 = 0, $1184 = 0, $1185 = 0, $1186 = 0, $1187 = 0, $1188 = 0, $1189 = 0;
 var $119 = 0, $1190 = 0, $1191 = 0, $1192 = 0, $1193 = 0, $1194 = 0, $1195 = 0, $1196 = 0, $1197 = 0, $1198 = 0, $1199 = 0, $12 = 0, $120 = 0, $1200 = 0, $1201 = 0, $1202 = 0, $1203 = 0, $1204 = 0, $1205 = 0, $1206 = 0;
 var $1207 = 0, $1208 = 0, $1209 = 0, $121 = 0, $1210 = 0, $1211 = 0, $1212 = 0, $1213 = 0, $1214 = 0, $1215 = 0, $1216 = 0, $1217 = 0, $1218 = 0, $1219 = 0, $122 = 0, $1220 = 0, $1221 = 0, $1222 = 0, $1223 = 0, $1224 = 0;
 var $1225 = 0, $1226 = 0, $1227 = 0, $1228 = 0, $1229 = 0, $123 = 0, $1230 = 0, $1231 = 0, $1232 = 0, $1233 = 0, $1234 = 0, $1235 = 0, $1236 = 0, $1237 = 0, $1238 = 0, $1239 = 0, $124 = 0, $1240 = 0, $1241 = 0, $1242 = 0;
 var $1243 = 0, $1244 = 0, $1245 = 0, $1246 = 0, $1247 = 0, $1248 = 0, $1249 = 0, $125 = 0, $1250 = 0, $1251 = 0, $1252 = 0, $1253 = 0, $1254 = 0, $1255 = 0, $1256 = 0, $1257 = 0, $1258 = 0, $1259 = 0, $126 = 0, $1260 = 0;
 var $1261 = 0, $1262 = 0, $1263 = 0, $1264 = 0, $1265 = 0, $1266 = 0, $1267 = 0, $1268 = 0, $1269 = 0, $127 = 0, $1270 = 0, $1271 = 0, $1272 = 0, $1273 = 0, $1274 = 0, $1275 = 0, $1276 = 0, $1277 = 0, $1278 = 0, $1279 = 0;
 var $128 = 0, $1280 = 0, $1281 = 0, $1282 = 0, $1283 = 0, $1284 = 0, $1285 = 0, $1286 = 0, $1287 = 0, $1288 = 0, $1289 = 0, $129 = 0, $1290 = 0, $1291 = 0, $1292 = 0, $1293 = 0, $1294 = 0, $1295 = 0, $1296 = 0, $1297 = 0;
 var $1298 = 0, $1299 = 0, $13 = 0, $130 = 0, $1300 = 0, $1301 = 0, $1302 = 0, $1303 = 0, $1304 = 0, $1305 = 0, $1306 = 0, $1307 = 0, $1308 = 0, $1309 = 0, $131 = 0, $1310 = 0, $1311 = 0, $1312 = 0, $1313 = 0, $1314 = 0;
 var $1315 = 0, $1316 = 0, $1317 = 0, $1318 = 0, $1319 = 0, $132 = 0, $1320 = 0, $1321 = 0, $1322 = 0, $1323 = 0, $1324 = 0, $1325 = 0, $1326 = 0, $1327 = 0, $1328 = 0, $1329 = 0, $133 = 0, $1330 = 0, $1331 = 0, $1332 = 0;
 var $1333 = 0, $1334 = 0, $1335 = 0, $1336 = 0, $1337 = 0, $1338 = 0, $1339 = 0, $134 = 0, $1340 = 0, $1341 = 0, $1342 = 0, $1343 = 0, $1344 = 0, $1345 = 0, $1346 = 0, $1347 = 0, $1348 = 0, $1349 = 0, $135 = 0, $1350 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0;
 var $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0;
 var $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0;
 var $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0;
 var $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0;
 var $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0;
 var $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0;
 var $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0;
 var $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0;
 var $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0;
 var $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0;
 var $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0;
 var $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0;
 var $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0;
 var $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0;
 var $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0;
 var $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0;
 var $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0;
 var $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0;
 var $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0;
 var $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0;
 var $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0;
 var $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0;
 var $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0;
 var $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0;
 var $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0;
 var $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0;
 var $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0;
 var $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0;
 var $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0;
 var $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0;
 var $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0;
 var $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0;
 var $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0;
 var $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0;
 var $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0;
 var $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0;
 var $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0;
 var $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0;
 var $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0;
 var $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0;
 var $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0;
 var $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 1920|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(1920|0);
 $$byval_copy12 = sp + 1900|0;
 $$byval_copy11 = sp + 1896|0;
 $$byval_copy10 = sp + 1892|0;
 $$byval_copy9 = sp + 1888|0;
 $$byval_copy8 = sp + 1884|0;
 $$byval_copy = sp + 1880|0;
 $21 = sp + 1796|0;
 $27 = sp + 1772|0;
 $33 = sp + 1748|0;
 $45 = sp + 1700|0;
 $51 = sp + 80|0;
 $54 = sp + 1911|0;
 $82 = sp + 1560|0;
 $83 = sp + 1556|0;
 $84 = sp + 1536|0;
 $85 = sp + 1532|0;
 $88 = sp + 1520|0;
 $97 = sp + 1484|0;
 $98 = sp + 72|0;
 $101 = sp + 1472|0;
 $102 = sp + 1464|0;
 $103 = sp + 64|0;
 $106 = sp + 1448|0;
 $107 = sp + 1440|0;
 $108 = sp + 56|0;
 $127 = sp + 48|0;
 $130 = sp + 1910|0;
 $139 = sp + 40|0;
 $142 = sp + 1909|0;
 $148 = sp + 32|0;
 $151 = sp + 1908|0;
 $166 = sp + 1232|0;
 $172 = sp + 1208|0;
 $178 = sp + 1184|0;
 $190 = sp + 1136|0;
 $196 = sp + 24|0;
 $199 = sp + 1907|0;
 $227 = sp + 996|0;
 $228 = sp + 992|0;
 $229 = sp + 972|0;
 $230 = sp + 968|0;
 $233 = sp + 956|0;
 $261 = sp + 844|0;
 $267 = sp + 820|0;
 $273 = sp + 796|0;
 $285 = sp + 748|0;
 $291 = sp + 16|0;
 $294 = sp + 1906|0;
 $322 = sp + 608|0;
 $323 = sp + 604|0;
 $324 = sp + 584|0;
 $325 = sp + 580|0;
 $328 = sp + 568|0;
 $357 = sp + 452|0;
 $363 = sp + 428|0;
 $369 = sp + 404|0;
 $381 = sp + 356|0;
 $406 = sp + 8|0;
 $409 = sp + 1905|0;
 $415 = sp;
 $418 = sp + 1904|0;
 $433 = sp + 164|0;
 $434 = sp + 160|0;
 $435 = sp + 156|0;
 $436 = sp + 152|0;
 $437 = sp + 132|0;
 $438 = sp + 128|0;
 $439 = sp + 124|0;
 $440 = sp + 112|0;
 $443 = sp + 96|0;
 $444 = sp + 88|0;
 $431 = $0;
 $446 = $431;
 $430 = $446;
 $447 = $430;
 $448 = ((($447)) + 20|0);
 $429 = $448;
 $449 = $429;
 $428 = $449;
 $450 = $428;
 $432 = $450;
 $427 = $446;
 $451 = $427;
 $426 = $451;
 $452 = $426;
 $425 = $452;
 $453 = $425;
 $454 = ((($453)) + 8|0);
 $455 = HEAP32[$454>>2]|0;
 $456 = ((($453)) + 4|0);
 $457 = HEAP32[$456>>2]|0;
 $458 = $455;
 $459 = $457;
 $460 = (($458) - ($459))|0;
 $461 = (($460|0) / 4)&-1;
 $462 = ($461|0)==(0);
 if ($462) {
  $483 = 0;
 } else {
  $424 = $452;
  $463 = $424;
  $464 = ((($463)) + 8|0);
  $465 = HEAP32[$464>>2]|0;
  $466 = ((($463)) + 4|0);
  $467 = HEAP32[$466>>2]|0;
  $468 = $465;
  $469 = $467;
  $470 = (($468) - ($469))|0;
  $471 = (($470|0) / 4)&-1;
  $472 = ($471*341)|0;
  $473 = (($472) - 1)|0;
  $483 = $473;
 }
 $474 = ((($451)) + 16|0);
 $475 = HEAP32[$474>>2]|0;
 $423 = $451;
 $476 = $423;
 $477 = ((($476)) + 20|0);
 $422 = $477;
 $478 = $422;
 $421 = $478;
 $479 = $421;
 $480 = HEAP32[$479>>2]|0;
 $481 = (($475) + ($480))|0;
 $482 = (($483) - ($481))|0;
 $484 = ($482>>>0)>=(341);
 if ($484) {
  $485 = ((($446)) + 16|0);
  $486 = HEAP32[$485>>2]|0;
  $487 = (($486) + 341)|0;
  HEAP32[$485>>2] = $487;
  $420 = $446;
  $488 = $420;
  $489 = ((($488)) + 8|0);
  $490 = HEAP32[$489>>2]|0;
  $491 = ((($490)) + -4|0);
  $492 = HEAP32[$491>>2]|0;
  HEAP32[$433>>2] = $492;
  $419 = $446;
  $493 = $419;
  $494 = ((($493)) + 8|0);
  $495 = HEAP32[$494>>2]|0;
  $496 = ((($495)) + -4|0);
  $416 = $493;
  $417 = $496;
  $497 = $416;
  $498 = $417;
  ;HEAP8[$415>>0]=HEAP8[$418>>0]|0;
  $413 = $497;
  $414 = $498;
  $499 = $413;
  while(1) {
   $500 = $414;
   $501 = ((($499)) + 8|0);
   $502 = HEAP32[$501>>2]|0;
   $503 = ($500|0)!=($502|0);
   if (!($503)) {
    break;
   }
   $412 = $499;
   $504 = $412;
   $505 = ((($504)) + 12|0);
   $411 = $505;
   $506 = $411;
   $410 = $506;
   $507 = $410;
   $508 = ((($499)) + 8|0);
   $509 = HEAP32[$508>>2]|0;
   $510 = ((($509)) + -4|0);
   HEAP32[$508>>2] = $510;
   $403 = $510;
   $511 = $403;
   $407 = $507;
   $408 = $511;
   $512 = $407;
   $513 = $408;
   ;HEAP8[$406>>0]=HEAP8[$409>>0]|0;
   $404 = $512;
   $405 = $513;
  }
  __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS7_EEE10push_frontERKS7_($446,$433);
  STACKTOP = sp;return;
 }
 $383 = $446;
 $514 = $383;
 $515 = ((($514)) + 8|0);
 $516 = HEAP32[$515>>2]|0;
 $517 = ((($514)) + 4|0);
 $518 = HEAP32[$517>>2]|0;
 $519 = $516;
 $520 = $518;
 $521 = (($519) - ($520))|0;
 $522 = (($521|0) / 4)&-1;
 $332 = $446;
 $523 = $332;
 $331 = $523;
 $524 = $331;
 $525 = ((($524)) + 12|0);
 $330 = $525;
 $526 = $330;
 $329 = $526;
 $527 = $329;
 $528 = HEAP32[$527>>2]|0;
 $529 = HEAP32[$523>>2]|0;
 $530 = $528;
 $531 = $529;
 $532 = (($530) - ($531))|0;
 $533 = (($532|0) / 4)&-1;
 $534 = ($522>>>0)<($533>>>0);
 if ($534) {
  $248 = $446;
  $535 = $248;
  $536 = ((($535)) + 4|0);
  $537 = HEAP32[$536>>2]|0;
  $538 = HEAP32[$535>>2]|0;
  $539 = $537;
  $540 = $538;
  $541 = (($539) - ($540))|0;
  $542 = (($541|0) / 4)&-1;
  $543 = ($542>>>0)>(0);
  $544 = $432;
  do {
   if ($543) {
    $246 = $544;
    $247 = 341;
    $545 = $246;
    $546 = $247;
    $243 = $545;
    $244 = $546;
    $245 = 0;
    $547 = $243;
    $548 = $244;
    $242 = $547;
    $549 = ($548>>>0)>(357913941);
    if ($549) {
     $550 = (___cxa_allocate_exception(4)|0);
     __ZNSt9bad_allocC2Ev($550);
     ___cxa_throw(($550|0),(72|0),(19|0));
     // unreachable;
    } else {
     $551 = $244;
     $552 = ($551*12)|0;
     $241 = $552;
     $553 = $241;
     $554 = (__Znwj($553)|0);
     HEAP32[$434>>2] = $554;
     __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS7_EEE10push_frontERKS7_($446,$434);
     break;
    }
   } else {
    $239 = $544;
    $240 = 341;
    $555 = $239;
    $556 = $240;
    $236 = $555;
    $237 = $556;
    $238 = 0;
    $557 = $236;
    $558 = $237;
    $235 = $557;
    $559 = ($558>>>0)>(357913941);
    if ($559) {
     $560 = (___cxa_allocate_exception(4)|0);
     __ZNSt9bad_allocC2Ev($560);
     ___cxa_throw(($560|0),(72|0),(19|0));
     // unreachable;
    }
    $561 = $237;
    $562 = ($561*12)|0;
    $234 = $562;
    $563 = $234;
    $564 = (__Znwj($563)|0);
    HEAP32[$435>>2] = $564;
    $223 = $446;
    $224 = $435;
    $565 = $223;
    $566 = ((($565)) + 8|0);
    $567 = HEAP32[$566>>2]|0;
    $222 = $565;
    $568 = $222;
    $569 = ((($568)) + 12|0);
    $221 = $569;
    $570 = $221;
    $220 = $570;
    $571 = $220;
    $572 = HEAP32[$571>>2]|0;
    $573 = ($567|0)==($572|0);
    do {
     if ($573) {
      $574 = ((($565)) + 4|0);
      $575 = HEAP32[$574>>2]|0;
      $576 = HEAP32[$565>>2]|0;
      $577 = ($575>>>0)>($576>>>0);
      if ($577) {
       $578 = ((($565)) + 4|0);
       $579 = HEAP32[$578>>2]|0;
       $580 = HEAP32[$565>>2]|0;
       $581 = $579;
       $582 = $580;
       $583 = (($581) - ($582))|0;
       $584 = (($583|0) / 4)&-1;
       $225 = $584;
       $585 = $225;
       $586 = (($585) + 1)|0;
       $587 = (($586|0) / 2)&-1;
       $225 = $587;
       $588 = ((($565)) + 4|0);
       $589 = HEAP32[$588>>2]|0;
       $590 = ((($565)) + 8|0);
       $591 = HEAP32[$590>>2]|0;
       $592 = ((($565)) + 4|0);
       $593 = HEAP32[$592>>2]|0;
       $594 = $225;
       $595 = (0 - ($594))|0;
       $596 = (($593) + ($595<<2)|0);
       $217 = $589;
       $218 = $591;
       $219 = $596;
       $597 = $217;
       $216 = $597;
       $598 = $216;
       $599 = $218;
       $210 = $599;
       $600 = $210;
       $601 = $219;
       $211 = $601;
       $602 = $211;
       $212 = $598;
       $213 = $600;
       $214 = $602;
       $603 = $213;
       $604 = $212;
       $605 = $603;
       $606 = $604;
       $607 = (($605) - ($606))|0;
       $608 = (($607|0) / 4)&-1;
       $215 = $608;
       $609 = $215;
       $610 = ($609>>>0)>(0);
       if ($610) {
        $611 = $214;
        $612 = $212;
        $613 = $215;
        $614 = $613<<2;
        _memmove(($611|0),($612|0),($614|0))|0;
       }
       $615 = $214;
       $616 = $215;
       $617 = (($615) + ($616<<2)|0);
       $618 = ((($565)) + 8|0);
       HEAP32[$618>>2] = $617;
       $619 = $225;
       $620 = ((($565)) + 4|0);
       $621 = HEAP32[$620>>2]|0;
       $622 = (0 - ($619))|0;
       $623 = (($621) + ($622<<2)|0);
       HEAP32[$620>>2] = $623;
       break;
      }
      $202 = $565;
      $624 = $202;
      $625 = ((($624)) + 12|0);
      $201 = $625;
      $626 = $201;
      $200 = $626;
      $627 = $200;
      $628 = HEAP32[$627>>2]|0;
      $629 = HEAP32[$565>>2]|0;
      $630 = $628;
      $631 = $629;
      $632 = (($630) - ($631))|0;
      $633 = (($632|0) / 4)&-1;
      $634 = $633<<1;
      HEAP32[$227>>2] = $634;
      HEAP32[$228>>2] = 1;
      $197 = $227;
      $198 = $228;
      $635 = $197;
      $636 = $198;
      ;HEAP8[$196>>0]=HEAP8[$199>>0]|0;
      $194 = $635;
      $195 = $636;
      $637 = $194;
      $638 = $195;
      $191 = $196;
      $192 = $637;
      $193 = $638;
      $639 = $192;
      $640 = HEAP32[$639>>2]|0;
      $641 = $193;
      $642 = HEAP32[$641>>2]|0;
      $643 = ($640>>>0)<($642>>>0);
      $644 = $195;
      $645 = $194;
      $646 = $643 ? $644 : $645;
      $647 = HEAP32[$646>>2]|0;
      $226 = $647;
      $648 = $226;
      $649 = $226;
      $650 = (($649>>>0) / 4)&-1;
      $160 = $565;
      $651 = $160;
      $652 = ((($651)) + 12|0);
      $159 = $652;
      $653 = $159;
      $158 = $653;
      $654 = $158;
      __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEEC2EjjS9_($229,$648,$650,$654);
      $655 = ((($565)) + 4|0);
      $656 = HEAP32[$655>>2]|0;
      $154 = $230;
      $155 = $656;
      $657 = $154;
      $658 = $155;
      HEAP32[$657>>2] = $658;
      $659 = ((($565)) + 8|0);
      $660 = HEAP32[$659>>2]|0;
      $156 = $233;
      $157 = $660;
      $661 = $156;
      $662 = $157;
      HEAP32[$661>>2] = $662;
      __THREW__ = 0;
      ;HEAP32[$$byval_copy>>2]=HEAP32[$230>>2]|0;
      ;HEAP32[$$byval_copy8>>2]=HEAP32[$233>>2]|0;
      invoke_viii(47,($229|0),($$byval_copy|0),($$byval_copy8|0));
      $663 = __THREW__; __THREW__ = 0;
      $664 = $663&1;
      if (!($664)) {
       $164 = $565;
       $165 = $229;
       $665 = $164;
       $163 = $665;
       $666 = $163;
       $667 = HEAP32[$666>>2]|0;
       HEAP32[$166>>2] = $667;
       $668 = $165;
       $161 = $668;
       $669 = $161;
       $670 = HEAP32[$669>>2]|0;
       $671 = $164;
       HEAP32[$671>>2] = $670;
       $162 = $166;
       $672 = $162;
       $673 = HEAP32[$672>>2]|0;
       $674 = $165;
       HEAP32[$674>>2] = $673;
       $675 = ((($565)) + 4|0);
       $676 = ((($229)) + 4|0);
       $170 = $675;
       $171 = $676;
       $677 = $170;
       $169 = $677;
       $678 = $169;
       $679 = HEAP32[$678>>2]|0;
       HEAP32[$172>>2] = $679;
       $680 = $171;
       $167 = $680;
       $681 = $167;
       $682 = HEAP32[$681>>2]|0;
       $683 = $170;
       HEAP32[$683>>2] = $682;
       $168 = $172;
       $684 = $168;
       $685 = HEAP32[$684>>2]|0;
       $686 = $171;
       HEAP32[$686>>2] = $685;
       $687 = ((($565)) + 8|0);
       $688 = ((($229)) + 8|0);
       $176 = $687;
       $177 = $688;
       $689 = $176;
       $175 = $689;
       $690 = $175;
       $691 = HEAP32[$690>>2]|0;
       HEAP32[$178>>2] = $691;
       $692 = $177;
       $173 = $692;
       $693 = $173;
       $694 = HEAP32[$693>>2]|0;
       $695 = $176;
       HEAP32[$695>>2] = $694;
       $174 = $178;
       $696 = $174;
       $697 = HEAP32[$696>>2]|0;
       $698 = $177;
       HEAP32[$698>>2] = $697;
       $181 = $565;
       $699 = $181;
       $700 = ((($699)) + 12|0);
       $180 = $700;
       $701 = $180;
       $179 = $701;
       $702 = $179;
       $184 = $229;
       $703 = $184;
       $704 = ((($703)) + 12|0);
       $183 = $704;
       $705 = $183;
       $182 = $705;
       $706 = $182;
       $188 = $702;
       $189 = $706;
       $707 = $188;
       $187 = $707;
       $708 = $187;
       $709 = HEAP32[$708>>2]|0;
       HEAP32[$190>>2] = $709;
       $710 = $189;
       $185 = $710;
       $711 = $185;
       $712 = HEAP32[$711>>2]|0;
       $713 = $188;
       HEAP32[$713>>2] = $712;
       $186 = $190;
       $714 = $186;
       $715 = HEAP32[$714>>2]|0;
       $716 = $189;
       HEAP32[$716>>2] = $715;
       __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEED2Ev($229);
       break;
      }
      $717 = ___cxa_find_matching_catch_2()|0;
      $718 = tempRet0;
      $231 = $717;
      $232 = $718;
      __THREW__ = 0;
      invoke_vi(48,($229|0));
      $719 = __THREW__; __THREW__ = 0;
      $720 = $719&1;
      if ($720) {
       $723 = ___cxa_find_matching_catch_3(0|0)|0;
       $724 = tempRet0;
       ___clang_call_terminate($723);
       // unreachable;
      } else {
       $721 = $231;
       $722 = $232;
       ___resumeException($721|0);
       // unreachable;
      }
     }
    } while(0);
    $205 = $565;
    $725 = $205;
    $726 = ((($725)) + 12|0);
    $204 = $726;
    $727 = $204;
    $203 = $727;
    $728 = $203;
    $729 = ((($565)) + 8|0);
    $730 = HEAP32[$729>>2]|0;
    $206 = $730;
    $731 = $206;
    $732 = $224;
    $207 = $728;
    $208 = $731;
    $209 = $732;
    $733 = $208;
    $734 = $209;
    $735 = HEAP32[$734>>2]|0;
    HEAP32[$733>>2] = $735;
    $736 = ((($565)) + 8|0);
    $737 = HEAP32[$736>>2]|0;
    $738 = ((($737)) + 4|0);
    HEAP32[$736>>2] = $738;
    $153 = $446;
    $739 = $153;
    $740 = ((($739)) + 8|0);
    $741 = HEAP32[$740>>2]|0;
    $742 = ((($741)) + -4|0);
    $743 = HEAP32[$742>>2]|0;
    HEAP32[$436>>2] = $743;
    $152 = $446;
    $744 = $152;
    $745 = ((($744)) + 8|0);
    $746 = HEAP32[$745>>2]|0;
    $747 = ((($746)) + -4|0);
    $149 = $744;
    $150 = $747;
    $748 = $149;
    $749 = $150;
    ;HEAP8[$148>>0]=HEAP8[$151>>0]|0;
    $146 = $748;
    $147 = $749;
    $750 = $146;
    while(1) {
     $751 = $147;
     $752 = ((($750)) + 8|0);
     $753 = HEAP32[$752>>2]|0;
     $754 = ($751|0)!=($753|0);
     if (!($754)) {
      break;
     }
     $145 = $750;
     $755 = $145;
     $756 = ((($755)) + 12|0);
     $144 = $756;
     $757 = $144;
     $143 = $757;
     $758 = $143;
     $759 = ((($750)) + 8|0);
     $760 = HEAP32[$759>>2]|0;
     $761 = ((($760)) + -4|0);
     HEAP32[$759>>2] = $761;
     $136 = $761;
     $762 = $136;
     $140 = $758;
     $141 = $762;
     $763 = $140;
     $764 = $141;
     ;HEAP8[$139>>0]=HEAP8[$142>>0]|0;
     $137 = $763;
     $138 = $764;
    }
    __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS7_EEE10push_frontERKS7_($446,$436);
   }
  } while(0);
  $135 = $446;
  $765 = $135;
  $766 = ((($765)) + 8|0);
  $767 = HEAP32[$766>>2]|0;
  $768 = ((($765)) + 4|0);
  $769 = HEAP32[$768>>2]|0;
  $770 = $767;
  $771 = $769;
  $772 = (($770) - ($771))|0;
  $773 = (($772|0) / 4)&-1;
  $774 = ($773|0)==(1);
  if ($774) {
   $779 = 170;
  } else {
   $775 = ((($446)) + 16|0);
   $776 = HEAP32[$775>>2]|0;
   $777 = (($776) + 341)|0;
   $779 = $777;
  }
  $778 = ((($446)) + 16|0);
  HEAP32[$778>>2] = $779;
  STACKTOP = sp;return;
 }
 $134 = $446;
 $780 = $134;
 $133 = $780;
 $781 = $133;
 $782 = ((($781)) + 12|0);
 $132 = $782;
 $783 = $132;
 $131 = $783;
 $784 = $131;
 $785 = HEAP32[$784>>2]|0;
 $786 = HEAP32[$780>>2]|0;
 $787 = $785;
 $788 = $786;
 $789 = (($787) - ($788))|0;
 $790 = (($789|0) / 4)&-1;
 $791 = $790<<1;
 HEAP32[$438>>2] = $791;
 HEAP32[$439>>2] = 1;
 $128 = $438;
 $129 = $439;
 $792 = $128;
 $793 = $129;
 ;HEAP8[$127>>0]=HEAP8[$130>>0]|0;
 $125 = $792;
 $126 = $793;
 $794 = $125;
 $795 = $126;
 $122 = $127;
 $123 = $794;
 $124 = $795;
 $796 = $123;
 $797 = HEAP32[$796>>2]|0;
 $798 = $124;
 $799 = HEAP32[$798>>2]|0;
 $800 = ($797>>>0)<($799>>>0);
 $801 = $126;
 $802 = $125;
 $803 = $800 ? $801 : $802;
 $804 = HEAP32[$803>>2]|0;
 $121 = $446;
 $805 = $121;
 $806 = ((($805)) + 12|0);
 $120 = $806;
 $807 = $120;
 $119 = $807;
 $808 = $119;
 __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEEC2EjjS9_($437,$804,0,$808);
 $809 = $432;
 $117 = $809;
 $118 = 341;
 $810 = $117;
 $811 = $118;
 $114 = $810;
 $115 = $811;
 $116 = 0;
 $812 = $114;
 $813 = $115;
 $113 = $812;
 $814 = ($813>>>0)>(357913941);
 if ($814) {
  $815 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($815);
  __THREW__ = 0;
  invoke_viii(49,($815|0),(72|0),(19|0));
  $816 = __THREW__; __THREW__ = 0;
  label = 60;
 } else {
  $817 = $115;
  $818 = ($817*12)|0;
  $112 = $818;
  $819 = $112;
  __THREW__ = 0;
  $820 = (invoke_ii(50,($819|0))|0);
  $821 = __THREW__; __THREW__ = 0;
  $822 = $821&1;
  if ($822) {
   label = 60;
  } else {
   $823 = $432;
   $109 = $443;
   $110 = $823;
   $111 = 341;
   $824 = $109;
   $825 = $110;
   HEAP32[$824>>2] = $825;
   $826 = ((($824)) + 4|0);
   $827 = $111;
   HEAP32[$826>>2] = $827;
   ;HEAP8[$108>>0]=HEAP8[$443>>0]|0;HEAP8[$108+1>>0]=HEAP8[$443+1>>0]|0;HEAP8[$108+2>>0]=HEAP8[$443+2>>0]|0;HEAP8[$108+3>>0]=HEAP8[$443+3>>0]|0;HEAP8[$108+4>>0]=HEAP8[$443+4>>0]|0;HEAP8[$108+5>>0]=HEAP8[$443+5>>0]|0;HEAP8[$108+6>>0]=HEAP8[$443+6>>0]|0;HEAP8[$108+7>>0]=HEAP8[$443+7>>0]|0;
   $105 = $440;
   HEAP32[$106>>2] = $820;
   $828 = $105;
   $104 = $106;
   $829 = $104;
   $830 = HEAP32[$829>>2]|0;
   $92 = $108;
   $831 = $92;
   ;HEAP32[$107>>2]=HEAP32[$831>>2]|0;HEAP32[$107+4>>2]=HEAP32[$831+4>>2]|0;
   ;HEAP8[$103>>0]=HEAP8[$107>>0]|0;HEAP8[$103+1>>0]=HEAP8[$107+1>>0]|0;HEAP8[$103+2>>0]=HEAP8[$107+2>>0]|0;HEAP8[$103+3>>0]=HEAP8[$107+3>>0]|0;HEAP8[$103+4>>0]=HEAP8[$107+4>>0]|0;HEAP8[$103+5>>0]=HEAP8[$107+5>>0]|0;HEAP8[$103+6>>0]=HEAP8[$107+6>>0]|0;HEAP8[$103+7>>0]=HEAP8[$107+7>>0]|0;
   $100 = $828;
   HEAP32[$101>>2] = $830;
   $832 = $100;
   $99 = $101;
   $833 = $99;
   $834 = HEAP32[$833>>2]|0;
   $93 = $103;
   $835 = $93;
   ;HEAP32[$102>>2]=HEAP32[$835>>2]|0;HEAP32[$102+4>>2]=HEAP32[$835+4>>2]|0;
   ;HEAP8[$98>>0]=HEAP8[$102>>0]|0;HEAP8[$98+1>>0]=HEAP8[$102+1>>0]|0;HEAP8[$98+2>>0]=HEAP8[$102+2>>0]|0;HEAP8[$98+3>>0]=HEAP8[$102+3>>0]|0;HEAP8[$98+4>>0]=HEAP8[$102+4>>0]|0;HEAP8[$98+5>>0]=HEAP8[$102+5>>0]|0;HEAP8[$98+6>>0]=HEAP8[$102+6>>0]|0;HEAP8[$98+7>>0]=HEAP8[$102+7>>0]|0;
   $96 = $832;
   HEAP32[$97>>2] = $834;
   $836 = $96;
   $95 = $97;
   $837 = $95;
   $838 = HEAP32[$837>>2]|0;
   HEAP32[$836>>2] = $838;
   $839 = ((($836)) + 4|0);
   $94 = $98;
   $840 = $94;
   ;HEAP32[$839>>2]=HEAP32[$840>>2]|0;HEAP32[$839+4>>2]=HEAP32[$840+4>>2]|0;
   $91 = $440;
   $841 = $91;
   $90 = $841;
   $842 = $90;
   $89 = $842;
   $843 = $89;
   $844 = HEAP32[$843>>2]|0;
   HEAP32[$444>>2] = $844;
   $78 = $437;
   $79 = $444;
   $845 = $78;
   $846 = ((($845)) + 8|0);
   $847 = HEAP32[$846>>2]|0;
   $77 = $845;
   $848 = $77;
   $849 = ((($848)) + 12|0);
   $76 = $849;
   $850 = $76;
   $75 = $850;
   $851 = $75;
   $852 = HEAP32[$851>>2]|0;
   $853 = ($847|0)==($852|0);
   do {
    if ($853) {
     $854 = ((($845)) + 4|0);
     $855 = HEAP32[$854>>2]|0;
     $856 = HEAP32[$845>>2]|0;
     $857 = ($855>>>0)>($856>>>0);
     if ($857) {
      $858 = ((($845)) + 4|0);
      $859 = HEAP32[$858>>2]|0;
      $860 = HEAP32[$845>>2]|0;
      $861 = $859;
      $862 = $860;
      $863 = (($861) - ($862))|0;
      $864 = (($863|0) / 4)&-1;
      $80 = $864;
      $865 = $80;
      $866 = (($865) + 1)|0;
      $867 = (($866|0) / 2)&-1;
      $80 = $867;
      $868 = ((($845)) + 4|0);
      $869 = HEAP32[$868>>2]|0;
      $870 = ((($845)) + 8|0);
      $871 = HEAP32[$870>>2]|0;
      $872 = ((($845)) + 4|0);
      $873 = HEAP32[$872>>2]|0;
      $874 = $80;
      $875 = (0 - ($874))|0;
      $876 = (($873) + ($875<<2)|0);
      $72 = $869;
      $73 = $871;
      $74 = $876;
      $877 = $72;
      $71 = $877;
      $878 = $71;
      $879 = $73;
      $65 = $879;
      $880 = $65;
      $881 = $74;
      $66 = $881;
      $882 = $66;
      $67 = $878;
      $68 = $880;
      $69 = $882;
      $883 = $68;
      $884 = $67;
      $885 = $883;
      $886 = $884;
      $887 = (($885) - ($886))|0;
      $888 = (($887|0) / 4)&-1;
      $70 = $888;
      $889 = $70;
      $890 = ($889>>>0)>(0);
      if ($890) {
       $891 = $69;
       $892 = $67;
       $893 = $70;
       $894 = $893<<2;
       _memmove(($891|0),($892|0),($894|0))|0;
      }
      $895 = $69;
      $896 = $70;
      $897 = (($895) + ($896<<2)|0);
      $898 = ((($845)) + 8|0);
      HEAP32[$898>>2] = $897;
      $899 = $80;
      $900 = ((($845)) + 4|0);
      $901 = HEAP32[$900>>2]|0;
      $902 = (0 - ($899))|0;
      $903 = (($901) + ($902<<2)|0);
      HEAP32[$900>>2] = $903;
      label = 46;
      break;
     }
     $57 = $845;
     $904 = $57;
     $905 = ((($904)) + 12|0);
     $56 = $905;
     $906 = $56;
     $55 = $906;
     $907 = $55;
     $908 = HEAP32[$907>>2]|0;
     $909 = HEAP32[$845>>2]|0;
     $910 = $908;
     $911 = $909;
     $912 = (($910) - ($911))|0;
     $913 = (($912|0) / 4)&-1;
     $914 = $913<<1;
     HEAP32[$82>>2] = $914;
     HEAP32[$83>>2] = 1;
     $52 = $82;
     $53 = $83;
     $915 = $52;
     $916 = $53;
     ;HEAP8[$51>>0]=HEAP8[$54>>0]|0;
     $49 = $915;
     $50 = $916;
     $917 = $49;
     $918 = $50;
     $46 = $51;
     $47 = $917;
     $48 = $918;
     $919 = $47;
     $920 = HEAP32[$919>>2]|0;
     $921 = $48;
     $922 = HEAP32[$921>>2]|0;
     $923 = ($920>>>0)<($922>>>0);
     $924 = $50;
     $925 = $49;
     $926 = $923 ? $924 : $925;
     $927 = HEAP32[$926>>2]|0;
     $81 = $927;
     $928 = $81;
     $929 = $81;
     $930 = (($929>>>0) / 4)&-1;
     $15 = $845;
     $931 = $15;
     $932 = ((($931)) + 12|0);
     $14 = $932;
     $933 = $14;
     $13 = $933;
     $934 = $13;
     $935 = ((($934)) + 4|0);
     $936 = HEAP32[$935>>2]|0;
     __THREW__ = 0;
     invoke_viiii(51,($84|0),($928|0),($930|0),($936|0));
     $937 = __THREW__; __THREW__ = 0;
     $938 = $937&1;
     if ($938) {
      label = 61;
     } else {
      $939 = ((($845)) + 4|0);
      $940 = HEAP32[$939>>2]|0;
      $9 = $85;
      $10 = $940;
      $941 = $9;
      $942 = $10;
      HEAP32[$941>>2] = $942;
      $943 = ((($845)) + 8|0);
      $944 = HEAP32[$943>>2]|0;
      $11 = $88;
      $12 = $944;
      $945 = $11;
      $946 = $12;
      HEAP32[$945>>2] = $946;
      __THREW__ = 0;
      ;HEAP32[$$byval_copy9>>2]=HEAP32[$85>>2]|0;
      ;HEAP32[$$byval_copy10>>2]=HEAP32[$88>>2]|0;
      invoke_viii(47,($84|0),($$byval_copy9|0),($$byval_copy10|0));
      $947 = __THREW__; __THREW__ = 0;
      $948 = $947&1;
      if (!($948)) {
       $19 = $845;
       $20 = $84;
       $949 = $19;
       $18 = $949;
       $950 = $18;
       $951 = HEAP32[$950>>2]|0;
       HEAP32[$21>>2] = $951;
       $952 = $20;
       $16 = $952;
       $953 = $16;
       $954 = HEAP32[$953>>2]|0;
       $955 = $19;
       HEAP32[$955>>2] = $954;
       $17 = $21;
       $956 = $17;
       $957 = HEAP32[$956>>2]|0;
       $958 = $20;
       HEAP32[$958>>2] = $957;
       $959 = ((($845)) + 4|0);
       $960 = ((($84)) + 4|0);
       $25 = $959;
       $26 = $960;
       $961 = $25;
       $24 = $961;
       $962 = $24;
       $963 = HEAP32[$962>>2]|0;
       HEAP32[$27>>2] = $963;
       $964 = $26;
       $22 = $964;
       $965 = $22;
       $966 = HEAP32[$965>>2]|0;
       $967 = $25;
       HEAP32[$967>>2] = $966;
       $23 = $27;
       $968 = $23;
       $969 = HEAP32[$968>>2]|0;
       $970 = $26;
       HEAP32[$970>>2] = $969;
       $971 = ((($845)) + 8|0);
       $972 = ((($84)) + 8|0);
       $31 = $971;
       $32 = $972;
       $973 = $31;
       $30 = $973;
       $974 = $30;
       $975 = HEAP32[$974>>2]|0;
       HEAP32[$33>>2] = $975;
       $976 = $32;
       $28 = $976;
       $977 = $28;
       $978 = HEAP32[$977>>2]|0;
       $979 = $31;
       HEAP32[$979>>2] = $978;
       $29 = $33;
       $980 = $29;
       $981 = HEAP32[$980>>2]|0;
       $982 = $32;
       HEAP32[$982>>2] = $981;
       $36 = $845;
       $983 = $36;
       $984 = ((($983)) + 12|0);
       $35 = $984;
       $985 = $35;
       $34 = $985;
       $986 = $34;
       $39 = $84;
       $987 = $39;
       $988 = ((($987)) + 12|0);
       $38 = $988;
       $989 = $38;
       $37 = $989;
       $990 = $37;
       $43 = $986;
       $44 = $990;
       $991 = $43;
       $42 = $991;
       $992 = $42;
       $993 = HEAP32[$992>>2]|0;
       HEAP32[$45>>2] = $993;
       $994 = $44;
       $40 = $994;
       $995 = $40;
       $996 = HEAP32[$995>>2]|0;
       $997 = $43;
       HEAP32[$997>>2] = $996;
       $41 = $45;
       $998 = $41;
       $999 = HEAP32[$998>>2]|0;
       $1000 = $44;
       HEAP32[$1000>>2] = $999;
       __THREW__ = 0;
       invoke_vi(48,($84|0));
       $1001 = __THREW__; __THREW__ = 0;
       $1002 = $1001&1;
       if ($1002) {
        label = 61;
        break;
       } else {
        label = 46;
        break;
       }
      }
      $1003 = ___cxa_find_matching_catch_2()|0;
      $1004 = tempRet0;
      $86 = $1003;
      $87 = $1004;
      __THREW__ = 0;
      invoke_vi(48,($84|0));
      $1005 = __THREW__; __THREW__ = 0;
      $1006 = $1005&1;
      if ($1006) {
       $1009 = ___cxa_find_matching_catch_3(0|0)|0;
       $1010 = tempRet0;
       ___clang_call_terminate($1009);
       // unreachable;
      } else {
       $1007 = $86;
       $1008 = $87;
       $$index = $1007;$$index3 = $1008;
       break;
      }
     }
    } else {
     label = 46;
    }
   } while(0);
   L67: do {
    if ((label|0) == 46) {
     $60 = $845;
     $1011 = $60;
     $1012 = ((($1011)) + 12|0);
     $59 = $1012;
     $1013 = $59;
     $58 = $1013;
     $1014 = $58;
     $1015 = ((($1014)) + 4|0);
     $1016 = HEAP32[$1015>>2]|0;
     $1017 = ((($845)) + 8|0);
     $1018 = HEAP32[$1017>>2]|0;
     $61 = $1018;
     $1019 = $61;
     $1020 = $79;
     $62 = $1016;
     $63 = $1019;
     $64 = $1020;
     $1021 = $63;
     $1022 = $64;
     $1023 = HEAP32[$1022>>2]|0;
     HEAP32[$1021>>2] = $1023;
     $1024 = ((($845)) + 8|0);
     $1025 = HEAP32[$1024>>2]|0;
     $1026 = ((($1025)) + 4|0);
     HEAP32[$1024>>2] = $1026;
     $7 = $440;
     $1027 = $7;
     $6 = $1027;
     $1028 = $6;
     $5 = $1028;
     $1029 = $5;
     $1030 = HEAP32[$1029>>2]|0;
     $8 = $1030;
     $4 = $1027;
     $1031 = $4;
     $3 = $1031;
     $1032 = $3;
     HEAP32[$1032>>2] = 0;
     $2 = $446;
     $1033 = $2;
     $1034 = ((($1033)) + 4|0);
     $1035 = HEAP32[$1034>>2]|0;
     $445 = $1035;
     L69: while(1) {
      $1036 = $445;
      $1 = $446;
      $1037 = $1;
      $1038 = ((($1037)) + 8|0);
      $1039 = HEAP32[$1038>>2]|0;
      $1040 = ($1036|0)!=($1039|0);
      if (!($1040)) {
       break;
      }
      $1041 = $445;
      $318 = $437;
      $319 = $1041;
      $1042 = $318;
      $1043 = ((($1042)) + 8|0);
      $1044 = HEAP32[$1043>>2]|0;
      $317 = $1042;
      $1045 = $317;
      $1046 = ((($1045)) + 12|0);
      $316 = $1046;
      $1047 = $316;
      $315 = $1047;
      $1048 = $315;
      $1049 = HEAP32[$1048>>2]|0;
      $1050 = ($1044|0)==($1049|0);
      do {
       if ($1050) {
        $1051 = ((($1042)) + 4|0);
        $1052 = HEAP32[$1051>>2]|0;
        $1053 = HEAP32[$1042>>2]|0;
        $1054 = ($1052>>>0)>($1053>>>0);
        if ($1054) {
         $1055 = ((($1042)) + 4|0);
         $1056 = HEAP32[$1055>>2]|0;
         $1057 = HEAP32[$1042>>2]|0;
         $1058 = $1056;
         $1059 = $1057;
         $1060 = (($1058) - ($1059))|0;
         $1061 = (($1060|0) / 4)&-1;
         $320 = $1061;
         $1062 = $320;
         $1063 = (($1062) + 1)|0;
         $1064 = (($1063|0) / 2)&-1;
         $320 = $1064;
         $1065 = ((($1042)) + 4|0);
         $1066 = HEAP32[$1065>>2]|0;
         $1067 = ((($1042)) + 8|0);
         $1068 = HEAP32[$1067>>2]|0;
         $1069 = ((($1042)) + 4|0);
         $1070 = HEAP32[$1069>>2]|0;
         $1071 = $320;
         $1072 = (0 - ($1071))|0;
         $1073 = (($1070) + ($1072<<2)|0);
         $312 = $1066;
         $313 = $1068;
         $314 = $1073;
         $1074 = $312;
         $311 = $1074;
         $1075 = $311;
         $1076 = $313;
         $305 = $1076;
         $1077 = $305;
         $1078 = $314;
         $306 = $1078;
         $1079 = $306;
         $307 = $1075;
         $308 = $1077;
         $309 = $1079;
         $1080 = $308;
         $1081 = $307;
         $1082 = $1080;
         $1083 = $1081;
         $1084 = (($1082) - ($1083))|0;
         $1085 = (($1084|0) / 4)&-1;
         $310 = $1085;
         $1086 = $310;
         $1087 = ($1086>>>0)>(0);
         if ($1087) {
          $1088 = $309;
          $1089 = $307;
          $1090 = $310;
          $1091 = $1090<<2;
          _memmove(($1088|0),($1089|0),($1091|0))|0;
         }
         $1092 = $309;
         $1093 = $310;
         $1094 = (($1092) + ($1093<<2)|0);
         $1095 = ((($1042)) + 8|0);
         HEAP32[$1095>>2] = $1094;
         $1096 = $320;
         $1097 = ((($1042)) + 4|0);
         $1098 = HEAP32[$1097>>2]|0;
         $1099 = (0 - ($1096))|0;
         $1100 = (($1098) + ($1099<<2)|0);
         HEAP32[$1097>>2] = $1100;
         break;
        } else {
         $297 = $1042;
         $1101 = $297;
         $1102 = ((($1101)) + 12|0);
         $296 = $1102;
         $1103 = $296;
         $295 = $1103;
         $1104 = $295;
         $1105 = HEAP32[$1104>>2]|0;
         $1106 = HEAP32[$1042>>2]|0;
         $1107 = $1105;
         $1108 = $1106;
         $1109 = (($1107) - ($1108))|0;
         $1110 = (($1109|0) / 4)&-1;
         $1111 = $1110<<1;
         HEAP32[$322>>2] = $1111;
         HEAP32[$323>>2] = 1;
         $292 = $322;
         $293 = $323;
         $1112 = $292;
         $1113 = $293;
         ;HEAP8[$291>>0]=HEAP8[$294>>0]|0;
         $289 = $1112;
         $290 = $1113;
         $1114 = $289;
         $1115 = $290;
         $286 = $291;
         $287 = $1114;
         $288 = $1115;
         $1116 = $287;
         $1117 = HEAP32[$1116>>2]|0;
         $1118 = $288;
         $1119 = HEAP32[$1118>>2]|0;
         $1120 = ($1117>>>0)<($1119>>>0);
         $1121 = $290;
         $1122 = $289;
         $1123 = $1120 ? $1121 : $1122;
         $1124 = HEAP32[$1123>>2]|0;
         $321 = $1124;
         $1125 = $321;
         $1126 = $321;
         $1127 = (($1126>>>0) / 4)&-1;
         $255 = $1042;
         $1128 = $255;
         $1129 = ((($1128)) + 12|0);
         $254 = $1129;
         $1130 = $254;
         $253 = $1130;
         $1131 = $253;
         $1132 = ((($1131)) + 4|0);
         $1133 = HEAP32[$1132>>2]|0;
         __THREW__ = 0;
         invoke_viiii(51,($324|0),($1125|0),($1127|0),($1133|0));
         $1134 = __THREW__; __THREW__ = 0;
         $1135 = $1134&1;
         if ($1135) {
          label = 61;
          break L67;
         }
         $1136 = ((($1042)) + 4|0);
         $1137 = HEAP32[$1136>>2]|0;
         $249 = $325;
         $250 = $1137;
         $1138 = $249;
         $1139 = $250;
         HEAP32[$1138>>2] = $1139;
         $1140 = ((($1042)) + 8|0);
         $1141 = HEAP32[$1140>>2]|0;
         $251 = $328;
         $252 = $1141;
         $1142 = $251;
         $1143 = $252;
         HEAP32[$1142>>2] = $1143;
         __THREW__ = 0;
         ;HEAP32[$$byval_copy11>>2]=HEAP32[$325>>2]|0;
         ;HEAP32[$$byval_copy12>>2]=HEAP32[$328>>2]|0;
         invoke_viii(47,($324|0),($$byval_copy11|0),($$byval_copy12|0));
         $1144 = __THREW__; __THREW__ = 0;
         $1145 = $1144&1;
         if ($1145) {
          label = 56;
          break L69;
         }
         $259 = $1042;
         $260 = $324;
         $1146 = $259;
         $258 = $1146;
         $1147 = $258;
         $1148 = HEAP32[$1147>>2]|0;
         HEAP32[$261>>2] = $1148;
         $1149 = $260;
         $256 = $1149;
         $1150 = $256;
         $1151 = HEAP32[$1150>>2]|0;
         $1152 = $259;
         HEAP32[$1152>>2] = $1151;
         $257 = $261;
         $1153 = $257;
         $1154 = HEAP32[$1153>>2]|0;
         $1155 = $260;
         HEAP32[$1155>>2] = $1154;
         $1156 = ((($1042)) + 4|0);
         $1157 = ((($324)) + 4|0);
         $265 = $1156;
         $266 = $1157;
         $1158 = $265;
         $264 = $1158;
         $1159 = $264;
         $1160 = HEAP32[$1159>>2]|0;
         HEAP32[$267>>2] = $1160;
         $1161 = $266;
         $262 = $1161;
         $1162 = $262;
         $1163 = HEAP32[$1162>>2]|0;
         $1164 = $265;
         HEAP32[$1164>>2] = $1163;
         $263 = $267;
         $1165 = $263;
         $1166 = HEAP32[$1165>>2]|0;
         $1167 = $266;
         HEAP32[$1167>>2] = $1166;
         $1168 = ((($1042)) + 8|0);
         $1169 = ((($324)) + 8|0);
         $271 = $1168;
         $272 = $1169;
         $1170 = $271;
         $270 = $1170;
         $1171 = $270;
         $1172 = HEAP32[$1171>>2]|0;
         HEAP32[$273>>2] = $1172;
         $1173 = $272;
         $268 = $1173;
         $1174 = $268;
         $1175 = HEAP32[$1174>>2]|0;
         $1176 = $271;
         HEAP32[$1176>>2] = $1175;
         $269 = $273;
         $1177 = $269;
         $1178 = HEAP32[$1177>>2]|0;
         $1179 = $272;
         HEAP32[$1179>>2] = $1178;
         $276 = $1042;
         $1180 = $276;
         $1181 = ((($1180)) + 12|0);
         $275 = $1181;
         $1182 = $275;
         $274 = $1182;
         $1183 = $274;
         $279 = $324;
         $1184 = $279;
         $1185 = ((($1184)) + 12|0);
         $278 = $1185;
         $1186 = $278;
         $277 = $1186;
         $1187 = $277;
         $283 = $1183;
         $284 = $1187;
         $1188 = $283;
         $282 = $1188;
         $1189 = $282;
         $1190 = HEAP32[$1189>>2]|0;
         HEAP32[$285>>2] = $1190;
         $1191 = $284;
         $280 = $1191;
         $1192 = $280;
         $1193 = HEAP32[$1192>>2]|0;
         $1194 = $283;
         HEAP32[$1194>>2] = $1193;
         $281 = $285;
         $1195 = $281;
         $1196 = HEAP32[$1195>>2]|0;
         $1197 = $284;
         HEAP32[$1197>>2] = $1196;
         __THREW__ = 0;
         invoke_vi(48,($324|0));
         $1198 = __THREW__; __THREW__ = 0;
         $1199 = $1198&1;
         if ($1199) {
          label = 61;
          break L67;
         } else {
          break;
         }
        }
       }
      } while(0);
      $300 = $1042;
      $1208 = $300;
      $1209 = ((($1208)) + 12|0);
      $299 = $1209;
      $1210 = $299;
      $298 = $1210;
      $1211 = $298;
      $1212 = ((($1211)) + 4|0);
      $1213 = HEAP32[$1212>>2]|0;
      $1214 = ((($1042)) + 8|0);
      $1215 = HEAP32[$1214>>2]|0;
      $301 = $1215;
      $1216 = $301;
      $1217 = $319;
      $302 = $1213;
      $303 = $1216;
      $304 = $1217;
      $1218 = $303;
      $1219 = $304;
      $1220 = HEAP32[$1219>>2]|0;
      HEAP32[$1218>>2] = $1220;
      $1221 = ((($1042)) + 8|0);
      $1222 = HEAP32[$1221>>2]|0;
      $1223 = ((($1222)) + 4|0);
      HEAP32[$1221>>2] = $1223;
      $1224 = $445;
      $1225 = ((($1224)) + 4|0);
      $445 = $1225;
     }
     if ((label|0) == 56) {
      $1200 = ___cxa_find_matching_catch_2()|0;
      $1201 = tempRet0;
      $326 = $1200;
      $327 = $1201;
      __THREW__ = 0;
      invoke_vi(48,($324|0));
      $1202 = __THREW__; __THREW__ = 0;
      $1203 = $1202&1;
      if ($1203) {
       $1206 = ___cxa_find_matching_catch_3(0|0)|0;
       $1207 = tempRet0;
       ___clang_call_terminate($1206);
       // unreachable;
      } else {
       $1204 = $326;
       $1205 = $327;
       $$index = $1204;$$index3 = $1205;
       break;
      }
     }
     $355 = $446;
     $356 = $437;
     $1254 = $355;
     $354 = $1254;
     $1255 = $354;
     $1256 = HEAP32[$1255>>2]|0;
     HEAP32[$357>>2] = $1256;
     $1257 = $356;
     $352 = $1257;
     $1258 = $352;
     $1259 = HEAP32[$1258>>2]|0;
     $1260 = $355;
     HEAP32[$1260>>2] = $1259;
     $353 = $357;
     $1261 = $353;
     $1262 = HEAP32[$1261>>2]|0;
     $1263 = $356;
     HEAP32[$1263>>2] = $1262;
     $1264 = ((($446)) + 4|0);
     $1265 = ((($437)) + 4|0);
     $361 = $1264;
     $362 = $1265;
     $1266 = $361;
     $360 = $1266;
     $1267 = $360;
     $1268 = HEAP32[$1267>>2]|0;
     HEAP32[$363>>2] = $1268;
     $1269 = $362;
     $358 = $1269;
     $1270 = $358;
     $1271 = HEAP32[$1270>>2]|0;
     $1272 = $361;
     HEAP32[$1272>>2] = $1271;
     $359 = $363;
     $1273 = $359;
     $1274 = HEAP32[$1273>>2]|0;
     $1275 = $362;
     HEAP32[$1275>>2] = $1274;
     $1276 = ((($446)) + 8|0);
     $1277 = ((($437)) + 8|0);
     $367 = $1276;
     $368 = $1277;
     $1278 = $367;
     $366 = $1278;
     $1279 = $366;
     $1280 = HEAP32[$1279>>2]|0;
     HEAP32[$369>>2] = $1280;
     $1281 = $368;
     $364 = $1281;
     $1282 = $364;
     $1283 = HEAP32[$1282>>2]|0;
     $1284 = $367;
     HEAP32[$1284>>2] = $1283;
     $365 = $369;
     $1285 = $365;
     $1286 = HEAP32[$1285>>2]|0;
     $1287 = $368;
     HEAP32[$1287>>2] = $1286;
     $372 = $446;
     $1288 = $372;
     $1289 = ((($1288)) + 12|0);
     $371 = $1289;
     $1290 = $371;
     $370 = $1290;
     $1291 = $370;
     $375 = $437;
     $1292 = $375;
     $1293 = ((($1292)) + 12|0);
     $374 = $1293;
     $1294 = $374;
     $373 = $1294;
     $1295 = $373;
     $379 = $1291;
     $380 = $1295;
     $1296 = $379;
     $378 = $1296;
     $1297 = $378;
     $1298 = HEAP32[$1297>>2]|0;
     HEAP32[$381>>2] = $1298;
     $1299 = $380;
     $376 = $1299;
     $1300 = $376;
     $1301 = HEAP32[$1300>>2]|0;
     $1302 = $379;
     HEAP32[$1302>>2] = $1301;
     $377 = $381;
     $1303 = $377;
     $1304 = HEAP32[$1303>>2]|0;
     $1305 = $380;
     HEAP32[$1305>>2] = $1304;
     $382 = $446;
     $1306 = $382;
     $1307 = ((($1306)) + 8|0);
     $1308 = HEAP32[$1307>>2]|0;
     $1309 = ((($1306)) + 4|0);
     $1310 = HEAP32[$1309>>2]|0;
     $1311 = $1308;
     $1312 = $1310;
     $1313 = (($1311) - ($1312))|0;
     $1314 = (($1313|0) / 4)&-1;
     $1315 = ($1314|0)==(1);
     if ($1315) {
      $1320 = 170;
     } else {
      $1316 = ((($446)) + 16|0);
      $1317 = HEAP32[$1316>>2]|0;
      $1318 = (($1317) + 341)|0;
      $1320 = $1318;
     }
     $1319 = ((($446)) + 16|0);
     HEAP32[$1319>>2] = $1320;
     $402 = $440;
     $1321 = $402;
     $399 = $1321;
     $400 = 0;
     $1322 = $399;
     $398 = $1322;
     $1323 = $398;
     $397 = $1323;
     $1324 = $397;
     $1325 = HEAP32[$1324>>2]|0;
     $401 = $1325;
     $1326 = $400;
     $387 = $1322;
     $1327 = $387;
     $386 = $1327;
     $1328 = $386;
     HEAP32[$1328>>2] = $1326;
     $1329 = $401;
     $1330 = ($1329|0)!=(0|0);
     if ($1330) {
      $385 = $1322;
      $1331 = $385;
      $384 = $1331;
      $1332 = $384;
      $1333 = ((($1332)) + 4|0);
      $1334 = $401;
      $395 = $1333;
      $396 = $1334;
      $1335 = $395;
      $1336 = HEAP32[$1335>>2]|0;
      $1337 = $396;
      $1338 = ((($1335)) + 4|0);
      $1339 = HEAP32[$1338>>2]|0;
      $392 = $1336;
      $393 = $1337;
      $394 = $1339;
      $1340 = $392;
      $1341 = $393;
      $1342 = $394;
      $389 = $1340;
      $390 = $1341;
      $391 = $1342;
      $1343 = $390;
      $388 = $1343;
      $1344 = $388;
      __ZdlPv($1344);
     }
     __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEED2Ev($437);
     STACKTOP = sp;return;
    }
   } while(0);
   if ((label|0) == 61) {
    $1228 = ___cxa_find_matching_catch_2()|0;
    $1229 = tempRet0;
    $$index = $1228;$$index3 = $1229;
   }
   $441 = $$index;
   $442 = $$index3;
   $351 = $440;
   $1230 = $351;
   $348 = $1230;
   $349 = 0;
   $1231 = $348;
   $347 = $1231;
   $1232 = $347;
   $346 = $1232;
   $1233 = $346;
   $1234 = HEAP32[$1233>>2]|0;
   $350 = $1234;
   $1235 = $349;
   $336 = $1231;
   $1236 = $336;
   $335 = $1236;
   $1237 = $335;
   HEAP32[$1237>>2] = $1235;
   $1238 = $350;
   $1239 = ($1238|0)!=(0|0);
   if ($1239) {
    $334 = $1231;
    $1240 = $334;
    $333 = $1240;
    $1241 = $333;
    $1242 = ((($1241)) + 4|0);
    $1243 = $350;
    $344 = $1242;
    $345 = $1243;
    $1244 = $344;
    $1245 = HEAP32[$1244>>2]|0;
    $1246 = $345;
    $1247 = ((($1244)) + 4|0);
    $1248 = HEAP32[$1247>>2]|0;
    $341 = $1245;
    $342 = $1246;
    $343 = $1248;
    $1249 = $341;
    $1250 = $342;
    $1251 = $343;
    $338 = $1249;
    $339 = $1250;
    $340 = $1251;
    $1252 = $339;
    $337 = $1252;
    $1253 = $337;
    __ZdlPv($1253);
   }
  }
 }
 if ((label|0) == 60) {
  $1226 = ___cxa_find_matching_catch_2()|0;
  $1227 = tempRet0;
  $441 = $1226;
  $442 = $1227;
 }
 __THREW__ = 0;
 invoke_vi(48,($437|0));
 $1345 = __THREW__; __THREW__ = 0;
 $1346 = $1345&1;
 if ($1346) {
  $1349 = ___cxa_find_matching_catch_3(0|0)|0;
  $1350 = tempRet0;
  ___clang_call_terminate($1349);
  // unreachable;
 } else {
  $1347 = $441;
  $1348 = $442;
  ___resumeException($1347|0);
  // unreachable;
 }
}
function __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS7_EEE10push_frontERKS7_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 368|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(368|0);
 $$byval_copy1 = sp + 348|0;
 $$byval_copy = sp + 344|0;
 $14 = sp;
 $17 = sp + 352|0;
 $23 = sp + 264|0;
 $29 = sp + 240|0;
 $35 = sp + 216|0;
 $47 = sp + 168|0;
 $78 = sp + 44|0;
 $79 = sp + 40|0;
 $80 = sp + 20|0;
 $81 = sp + 16|0;
 $84 = sp + 4|0;
 $74 = $0;
 $75 = $1;
 $85 = $74;
 $86 = ((($85)) + 4|0);
 $87 = HEAP32[$86>>2]|0;
 $88 = HEAP32[$85>>2]|0;
 $89 = ($87|0)==($88|0);
 if (!($89)) {
  $63 = $85;
  $246 = $63;
  $247 = ((($246)) + 12|0);
  $62 = $247;
  $248 = $62;
  $61 = $248;
  $249 = $61;
  $250 = ((($85)) + 4|0);
  $251 = HEAP32[$250>>2]|0;
  $252 = ((($251)) + -4|0);
  $64 = $252;
  $253 = $64;
  $254 = $75;
  $65 = $249;
  $66 = $253;
  $67 = $254;
  $255 = $66;
  $256 = $67;
  $257 = HEAP32[$256>>2]|0;
  HEAP32[$255>>2] = $257;
  $258 = ((($85)) + 4|0);
  $259 = HEAP32[$258>>2]|0;
  $260 = ((($259)) + -4|0);
  HEAP32[$258>>2] = $260;
  STACKTOP = sp;return;
 }
 $90 = ((($85)) + 8|0);
 $91 = HEAP32[$90>>2]|0;
 $73 = $85;
 $92 = $73;
 $93 = ((($92)) + 12|0);
 $72 = $93;
 $94 = $72;
 $71 = $94;
 $95 = $71;
 $96 = HEAP32[$95>>2]|0;
 $97 = ($91>>>0)<($96>>>0);
 if ($97) {
  $70 = $85;
  $98 = $70;
  $99 = ((($98)) + 12|0);
  $69 = $99;
  $100 = $69;
  $68 = $100;
  $101 = $68;
  $102 = HEAP32[$101>>2]|0;
  $103 = ((($85)) + 8|0);
  $104 = HEAP32[$103>>2]|0;
  $105 = $102;
  $106 = $104;
  $107 = (($105) - ($106))|0;
  $108 = (($107|0) / 4)&-1;
  $76 = $108;
  $109 = $76;
  $110 = (($109) + 1)|0;
  $111 = (($110|0) / 2)&-1;
  $76 = $111;
  $112 = ((($85)) + 4|0);
  $113 = HEAP32[$112>>2]|0;
  $114 = ((($85)) + 8|0);
  $115 = HEAP32[$114>>2]|0;
  $116 = ((($85)) + 8|0);
  $117 = HEAP32[$116>>2]|0;
  $118 = $76;
  $119 = (($117) + ($118<<2)|0);
  $58 = $113;
  $59 = $115;
  $60 = $119;
  $120 = $58;
  $57 = $120;
  $121 = $57;
  $122 = $59;
  $51 = $122;
  $123 = $51;
  $124 = $60;
  $52 = $124;
  $125 = $52;
  $53 = $121;
  $54 = $123;
  $55 = $125;
  $126 = $54;
  $127 = $53;
  $128 = $126;
  $129 = $127;
  $130 = (($128) - ($129))|0;
  $131 = (($130|0) / 4)&-1;
  $56 = $131;
  $132 = $56;
  $133 = ($132>>>0)>(0);
  if ($133) {
   $134 = $56;
   $135 = $55;
   $136 = (0 - ($134))|0;
   $137 = (($135) + ($136<<2)|0);
   $55 = $137;
   $138 = $55;
   $139 = $53;
   $140 = $56;
   $141 = $140<<2;
   _memmove(($138|0),($139|0),($141|0))|0;
  }
  $142 = $55;
  $143 = ((($85)) + 4|0);
  HEAP32[$143>>2] = $142;
  $144 = $76;
  $145 = ((($85)) + 8|0);
  $146 = HEAP32[$145>>2]|0;
  $147 = (($146) + ($144<<2)|0);
  HEAP32[$145>>2] = $147;
  $63 = $85;
  $246 = $63;
  $247 = ((($246)) + 12|0);
  $62 = $247;
  $248 = $62;
  $61 = $248;
  $249 = $61;
  $250 = ((($85)) + 4|0);
  $251 = HEAP32[$250>>2]|0;
  $252 = ((($251)) + -4|0);
  $64 = $252;
  $253 = $64;
  $254 = $75;
  $65 = $249;
  $66 = $253;
  $67 = $254;
  $255 = $66;
  $256 = $67;
  $257 = HEAP32[$256>>2]|0;
  HEAP32[$255>>2] = $257;
  $258 = ((($85)) + 4|0);
  $259 = HEAP32[$258>>2]|0;
  $260 = ((($259)) + -4|0);
  HEAP32[$258>>2] = $260;
  STACKTOP = sp;return;
 }
 $50 = $85;
 $148 = $50;
 $149 = ((($148)) + 12|0);
 $49 = $149;
 $150 = $49;
 $48 = $150;
 $151 = $48;
 $152 = HEAP32[$151>>2]|0;
 $153 = HEAP32[$85>>2]|0;
 $154 = $152;
 $155 = $153;
 $156 = (($154) - ($155))|0;
 $157 = (($156|0) / 4)&-1;
 $158 = $157<<1;
 HEAP32[$78>>2] = $158;
 HEAP32[$79>>2] = 1;
 $15 = $78;
 $16 = $79;
 $159 = $15;
 $160 = $16;
 ;HEAP8[$14>>0]=HEAP8[$17>>0]|0;
 $12 = $159;
 $13 = $160;
 $161 = $12;
 $162 = $13;
 $9 = $14;
 $10 = $161;
 $11 = $162;
 $163 = $10;
 $164 = HEAP32[$163>>2]|0;
 $165 = $11;
 $166 = HEAP32[$165>>2]|0;
 $167 = ($164>>>0)<($166>>>0);
 $168 = $13;
 $169 = $12;
 $170 = $167 ? $168 : $169;
 $171 = HEAP32[$170>>2]|0;
 $77 = $171;
 $172 = $77;
 $173 = $77;
 $174 = (($173) + 3)|0;
 $175 = (($174>>>0) / 4)&-1;
 $4 = $85;
 $176 = $4;
 $177 = ((($176)) + 12|0);
 $3 = $177;
 $178 = $3;
 $2 = $178;
 $179 = $2;
 __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEEC2EjjS9_($80,$172,$175,$179);
 $180 = ((($85)) + 4|0);
 $181 = HEAP32[$180>>2]|0;
 $5 = $81;
 $6 = $181;
 $182 = $5;
 $183 = $6;
 HEAP32[$182>>2] = $183;
 $184 = ((($85)) + 8|0);
 $185 = HEAP32[$184>>2]|0;
 $7 = $84;
 $8 = $185;
 $186 = $7;
 $187 = $8;
 HEAP32[$186>>2] = $187;
 __THREW__ = 0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$81>>2]|0;
 ;HEAP32[$$byval_copy1>>2]=HEAP32[$84>>2]|0;
 invoke_viii(47,($80|0),($$byval_copy|0),($$byval_copy1|0));
 $188 = __THREW__; __THREW__ = 0;
 $189 = $188&1;
 if (!($189)) {
  $21 = $85;
  $22 = $80;
  $190 = $21;
  $20 = $190;
  $191 = $20;
  $192 = HEAP32[$191>>2]|0;
  HEAP32[$23>>2] = $192;
  $193 = $22;
  $18 = $193;
  $194 = $18;
  $195 = HEAP32[$194>>2]|0;
  $196 = $21;
  HEAP32[$196>>2] = $195;
  $19 = $23;
  $197 = $19;
  $198 = HEAP32[$197>>2]|0;
  $199 = $22;
  HEAP32[$199>>2] = $198;
  $200 = ((($85)) + 4|0);
  $201 = ((($80)) + 4|0);
  $27 = $200;
  $28 = $201;
  $202 = $27;
  $26 = $202;
  $203 = $26;
  $204 = HEAP32[$203>>2]|0;
  HEAP32[$29>>2] = $204;
  $205 = $28;
  $24 = $205;
  $206 = $24;
  $207 = HEAP32[$206>>2]|0;
  $208 = $27;
  HEAP32[$208>>2] = $207;
  $25 = $29;
  $209 = $25;
  $210 = HEAP32[$209>>2]|0;
  $211 = $28;
  HEAP32[$211>>2] = $210;
  $212 = ((($85)) + 8|0);
  $213 = ((($80)) + 8|0);
  $33 = $212;
  $34 = $213;
  $214 = $33;
  $32 = $214;
  $215 = $32;
  $216 = HEAP32[$215>>2]|0;
  HEAP32[$35>>2] = $216;
  $217 = $34;
  $30 = $217;
  $218 = $30;
  $219 = HEAP32[$218>>2]|0;
  $220 = $33;
  HEAP32[$220>>2] = $219;
  $31 = $35;
  $221 = $31;
  $222 = HEAP32[$221>>2]|0;
  $223 = $34;
  HEAP32[$223>>2] = $222;
  $38 = $85;
  $224 = $38;
  $225 = ((($224)) + 12|0);
  $37 = $225;
  $226 = $37;
  $36 = $226;
  $227 = $36;
  $41 = $80;
  $228 = $41;
  $229 = ((($228)) + 12|0);
  $40 = $229;
  $230 = $40;
  $39 = $230;
  $231 = $39;
  $45 = $227;
  $46 = $231;
  $232 = $45;
  $44 = $232;
  $233 = $44;
  $234 = HEAP32[$233>>2]|0;
  HEAP32[$47>>2] = $234;
  $235 = $46;
  $42 = $235;
  $236 = $42;
  $237 = HEAP32[$236>>2]|0;
  $238 = $45;
  HEAP32[$238>>2] = $237;
  $43 = $47;
  $239 = $43;
  $240 = HEAP32[$239>>2]|0;
  $241 = $46;
  HEAP32[$241>>2] = $240;
  __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEED2Ev($80);
  $63 = $85;
  $246 = $63;
  $247 = ((($246)) + 12|0);
  $62 = $247;
  $248 = $62;
  $61 = $248;
  $249 = $61;
  $250 = ((($85)) + 4|0);
  $251 = HEAP32[$250>>2]|0;
  $252 = ((($251)) + -4|0);
  $64 = $252;
  $253 = $64;
  $254 = $75;
  $65 = $249;
  $66 = $253;
  $67 = $254;
  $255 = $66;
  $256 = $67;
  $257 = HEAP32[$256>>2]|0;
  HEAP32[$255>>2] = $257;
  $258 = ((($85)) + 4|0);
  $259 = HEAP32[$258>>2]|0;
  $260 = ((($259)) + -4|0);
  HEAP32[$258>>2] = $260;
  STACKTOP = sp;return;
 }
 $242 = ___cxa_find_matching_catch_2()|0;
 $243 = tempRet0;
 $82 = $242;
 $83 = $243;
 __THREW__ = 0;
 invoke_vi(48,($80|0));
 $244 = __THREW__; __THREW__ = 0;
 $245 = $244&1;
 if ($245) {
  $263 = ___cxa_find_matching_catch_3(0|0)|0;
  $264 = tempRet0;
  ___clang_call_terminate($263);
  // unreachable;
 } else {
  $261 = $82;
  $262 = $83;
  ___resumeException($261|0);
  // unreachable;
 }
}
function __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEEC2EjjS9_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(160|0);
 $11 = sp + 116|0;
 $15 = sp + 100|0;
 $27 = sp + 52|0;
 $34 = sp + 24|0;
 $39 = sp + 4|0;
 $40 = sp;
 $35 = $0;
 $36 = $1;
 $37 = $2;
 $38 = $3;
 $41 = $35;
 $42 = ((($41)) + 12|0);
 $32 = $34;
 $33 = -1;
 $43 = $32;
 HEAP32[$43>>2] = 0;
 $44 = HEAP32[$34>>2]|0;
 HEAP32[$39>>2] = $44;
 $17 = $39;
 $45 = $38;
 $14 = $42;
 HEAP32[$15>>2] = 0;
 $16 = $45;
 $46 = $14;
 $13 = $15;
 $47 = $13;
 $48 = HEAP32[$47>>2]|0;
 $49 = $16;
 $7 = $49;
 $50 = $7;
 $10 = $46;
 HEAP32[$11>>2] = $48;
 $12 = $50;
 $51 = $10;
 $9 = $11;
 $52 = $9;
 $53 = HEAP32[$52>>2]|0;
 HEAP32[$51>>2] = $53;
 $54 = ((($51)) + 4|0);
 $55 = $12;
 $8 = $55;
 $56 = $8;
 HEAP32[$54>>2] = $56;
 $57 = $36;
 $58 = ($57|0)!=(0);
 do {
  if ($58) {
   $6 = $41;
   $59 = $6;
   $60 = ((($59)) + 12|0);
   $5 = $60;
   $61 = $5;
   $4 = $61;
   $62 = $4;
   $63 = ((($62)) + 4|0);
   $64 = HEAP32[$63>>2]|0;
   $65 = $36;
   $23 = $64;
   $24 = $65;
   $66 = $23;
   $67 = $24;
   $20 = $66;
   $21 = $67;
   $22 = 0;
   $68 = $20;
   $69 = $21;
   $19 = $68;
   $70 = ($69>>>0)>(1073741823);
   if ($70) {
    $71 = (___cxa_allocate_exception(4)|0);
    __ZNSt9bad_allocC2Ev($71);
    ___cxa_throw(($71|0),(72|0),(19|0));
    // unreachable;
   } else {
    $72 = $21;
    $73 = $72<<2;
    $18 = $73;
    $74 = $18;
    $75 = (__Znwj($74)|0);
    $78 = $75;
    break;
   }
  } else {
   $25 = $27;
   $26 = -1;
   $76 = $25;
   HEAP32[$76>>2] = 0;
   $77 = HEAP32[$27>>2]|0;
   HEAP32[$40>>2] = $77;
   $28 = $40;
   $78 = 0;
  }
 } while(0);
 HEAP32[$41>>2] = $78;
 $79 = HEAP32[$41>>2]|0;
 $80 = $37;
 $81 = (($79) + ($80<<2)|0);
 $82 = ((($41)) + 8|0);
 HEAP32[$82>>2] = $81;
 $83 = ((($41)) + 4|0);
 HEAP32[$83>>2] = $81;
 $84 = HEAP32[$41>>2]|0;
 $85 = $36;
 $86 = (($84) + ($85<<2)|0);
 $31 = $41;
 $87 = $31;
 $88 = ((($87)) + 12|0);
 $30 = $88;
 $89 = $30;
 $29 = $89;
 $90 = $29;
 HEAP32[$90>>2] = $86;
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $18 = sp + 8|0;
 $21 = sp + 125|0;
 $27 = sp;
 $30 = sp + 124|0;
 $32 = $0;
 $33 = $32;
 $31 = $33;
 $34 = $31;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 $28 = $34;
 $29 = $36;
 $37 = $28;
 $38 = $29;
 ;HEAP8[$27>>0]=HEAP8[$30>>0]|0;
 $25 = $37;
 $26 = $38;
 $39 = $25;
 while(1) {
  $40 = $26;
  $41 = ((($39)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = ($40|0)!=($42|0);
  if (!($43)) {
   break;
  }
  $24 = $39;
  $44 = $24;
  $45 = ((($44)) + 12|0);
  $23 = $45;
  $46 = $23;
  $22 = $46;
  $47 = $22;
  $48 = ((($47)) + 4|0);
  $49 = HEAP32[$48>>2]|0;
  $50 = ((($39)) + 8|0);
  $51 = HEAP32[$50>>2]|0;
  $52 = ((($51)) + -4|0);
  HEAP32[$50>>2] = $52;
  $15 = $52;
  $53 = $15;
  $19 = $49;
  $20 = $53;
  $54 = $19;
  $55 = $20;
  ;HEAP8[$18>>0]=HEAP8[$21>>0]|0;
  $16 = $54;
  $17 = $55;
 }
 $56 = HEAP32[$33>>2]|0;
 $57 = ($56|0)!=(0|0);
 if (!($57)) {
  STACKTOP = sp;return;
 }
 $7 = $33;
 $58 = $7;
 $59 = ((($58)) + 12|0);
 $6 = $59;
 $60 = $6;
 $5 = $60;
 $61 = $5;
 $62 = ((($61)) + 4|0);
 $63 = HEAP32[$62>>2]|0;
 $64 = HEAP32[$33>>2]|0;
 $4 = $33;
 $65 = $4;
 $3 = $65;
 $66 = $3;
 $67 = ((($66)) + 12|0);
 $2 = $67;
 $68 = $2;
 $1 = $68;
 $69 = $1;
 $70 = HEAP32[$69>>2]|0;
 $71 = HEAP32[$65>>2]|0;
 $72 = $70;
 $73 = $71;
 $74 = (($72) - ($73))|0;
 $75 = (($74|0) / 4)&-1;
 $12 = $63;
 $13 = $64;
 $14 = $75;
 $76 = $12;
 $77 = $13;
 $78 = $14;
 $9 = $76;
 $10 = $77;
 $11 = $78;
 $79 = $10;
 $8 = $79;
 $80 = $8;
 __ZdlPv($80);
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEE18__construct_at_endINS_13move_iteratorIPS7_EEEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeESG_SG_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $16 = $0;
 $18 = $16;
 $15 = $18;
 $19 = $15;
 $20 = ((($19)) + 12|0);
 $14 = $20;
 $21 = $14;
 $13 = $21;
 $22 = $13;
 $23 = ((($22)) + 4|0);
 $24 = HEAP32[$23>>2]|0;
 $17 = $24;
 while(1) {
  $5 = $1;
  $6 = $2;
  $25 = $5;
  $4 = $25;
  $26 = $4;
  $27 = HEAP32[$26>>2]|0;
  $28 = $6;
  $3 = $28;
  $29 = $3;
  $30 = HEAP32[$29>>2]|0;
  $31 = ($27|0)!=($30|0);
  if (!($31)) {
   break;
  }
  $32 = $17;
  $33 = ((($18)) + 8|0);
  $34 = HEAP32[$33>>2]|0;
  $7 = $34;
  $35 = $7;
  $8 = $1;
  $36 = $8;
  $37 = HEAP32[$36>>2]|0;
  $9 = $32;
  $10 = $35;
  $11 = $37;
  $38 = $10;
  $39 = $11;
  $40 = HEAP32[$39>>2]|0;
  HEAP32[$38>>2] = $40;
  $41 = ((($18)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = ((($42)) + 4|0);
  HEAP32[$41>>2] = $43;
  $12 = $1;
  $44 = $12;
  $45 = HEAP32[$44>>2]|0;
  $46 = ((($45)) + 4|0);
  HEAP32[$44>>2] = $46;
 }
 STACKTOP = sp;return;
}
function __ZNSt3__25dequeIiNS_9allocatorIiEEE20__add_front_capacityEv($0) {
 $0 = $0|0;
 var $$byval_copy = 0, $$byval_copy10 = 0, $$byval_copy11 = 0, $$byval_copy12 = 0, $$byval_copy8 = 0, $$byval_copy9 = 0, $$index = 0, $$index3 = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0;
 var $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0;
 var $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0;
 var $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0, $1062 = 0;
 var $1063 = 0, $1064 = 0, $1065 = 0, $1066 = 0, $1067 = 0, $1068 = 0, $1069 = 0, $107 = 0, $1070 = 0, $1071 = 0, $1072 = 0, $1073 = 0, $1074 = 0, $1075 = 0, $1076 = 0, $1077 = 0, $1078 = 0, $1079 = 0, $108 = 0, $1080 = 0;
 var $1081 = 0, $1082 = 0, $1083 = 0, $1084 = 0, $1085 = 0, $1086 = 0, $1087 = 0, $1088 = 0, $1089 = 0, $109 = 0, $1090 = 0, $1091 = 0, $1092 = 0, $1093 = 0, $1094 = 0, $1095 = 0, $1096 = 0, $1097 = 0, $1098 = 0, $1099 = 0;
 var $11 = 0, $110 = 0, $1100 = 0, $1101 = 0, $1102 = 0, $1103 = 0, $1104 = 0, $1105 = 0, $1106 = 0, $1107 = 0, $1108 = 0, $1109 = 0, $111 = 0, $1110 = 0, $1111 = 0, $1112 = 0, $1113 = 0, $1114 = 0, $1115 = 0, $1116 = 0;
 var $1117 = 0, $1118 = 0, $1119 = 0, $112 = 0, $1120 = 0, $1121 = 0, $1122 = 0, $1123 = 0, $1124 = 0, $1125 = 0, $1126 = 0, $1127 = 0, $1128 = 0, $1129 = 0, $113 = 0, $1130 = 0, $1131 = 0, $1132 = 0, $1133 = 0, $1134 = 0;
 var $1135 = 0, $1136 = 0, $1137 = 0, $1138 = 0, $1139 = 0, $114 = 0, $1140 = 0, $1141 = 0, $1142 = 0, $1143 = 0, $1144 = 0, $1145 = 0, $1146 = 0, $1147 = 0, $1148 = 0, $1149 = 0, $115 = 0, $1150 = 0, $1151 = 0, $1152 = 0;
 var $1153 = 0, $1154 = 0, $1155 = 0, $1156 = 0, $1157 = 0, $1158 = 0, $1159 = 0, $116 = 0, $1160 = 0, $1161 = 0, $1162 = 0, $1163 = 0, $1164 = 0, $1165 = 0, $1166 = 0, $1167 = 0, $1168 = 0, $1169 = 0, $117 = 0, $1170 = 0;
 var $1171 = 0, $1172 = 0, $1173 = 0, $1174 = 0, $1175 = 0, $1176 = 0, $1177 = 0, $1178 = 0, $1179 = 0, $118 = 0, $1180 = 0, $1181 = 0, $1182 = 0, $1183 = 0, $1184 = 0, $1185 = 0, $1186 = 0, $1187 = 0, $1188 = 0, $1189 = 0;
 var $119 = 0, $1190 = 0, $1191 = 0, $1192 = 0, $1193 = 0, $1194 = 0, $1195 = 0, $1196 = 0, $1197 = 0, $1198 = 0, $1199 = 0, $12 = 0, $120 = 0, $1200 = 0, $1201 = 0, $1202 = 0, $1203 = 0, $1204 = 0, $1205 = 0, $1206 = 0;
 var $1207 = 0, $1208 = 0, $1209 = 0, $121 = 0, $1210 = 0, $1211 = 0, $1212 = 0, $1213 = 0, $1214 = 0, $1215 = 0, $1216 = 0, $1217 = 0, $1218 = 0, $1219 = 0, $122 = 0, $1220 = 0, $1221 = 0, $1222 = 0, $1223 = 0, $1224 = 0;
 var $1225 = 0, $1226 = 0, $1227 = 0, $1228 = 0, $1229 = 0, $123 = 0, $1230 = 0, $1231 = 0, $1232 = 0, $1233 = 0, $1234 = 0, $1235 = 0, $1236 = 0, $1237 = 0, $1238 = 0, $1239 = 0, $124 = 0, $1240 = 0, $1241 = 0, $1242 = 0;
 var $1243 = 0, $1244 = 0, $1245 = 0, $1246 = 0, $1247 = 0, $1248 = 0, $1249 = 0, $125 = 0, $1250 = 0, $1251 = 0, $1252 = 0, $1253 = 0, $1254 = 0, $1255 = 0, $1256 = 0, $1257 = 0, $1258 = 0, $1259 = 0, $126 = 0, $1260 = 0;
 var $1261 = 0, $1262 = 0, $1263 = 0, $1264 = 0, $1265 = 0, $1266 = 0, $1267 = 0, $1268 = 0, $1269 = 0, $127 = 0, $1270 = 0, $1271 = 0, $1272 = 0, $1273 = 0, $1274 = 0, $1275 = 0, $1276 = 0, $1277 = 0, $1278 = 0, $1279 = 0;
 var $128 = 0, $1280 = 0, $1281 = 0, $1282 = 0, $1283 = 0, $1284 = 0, $1285 = 0, $1286 = 0, $1287 = 0, $1288 = 0, $1289 = 0, $129 = 0, $1290 = 0, $1291 = 0, $1292 = 0, $1293 = 0, $1294 = 0, $1295 = 0, $1296 = 0, $1297 = 0;
 var $1298 = 0, $1299 = 0, $13 = 0, $130 = 0, $1300 = 0, $1301 = 0, $1302 = 0, $1303 = 0, $1304 = 0, $1305 = 0, $1306 = 0, $1307 = 0, $1308 = 0, $1309 = 0, $131 = 0, $1310 = 0, $1311 = 0, $1312 = 0, $1313 = 0, $1314 = 0;
 var $1315 = 0, $1316 = 0, $1317 = 0, $1318 = 0, $1319 = 0, $132 = 0, $1320 = 0, $1321 = 0, $1322 = 0, $1323 = 0, $1324 = 0, $1325 = 0, $1326 = 0, $1327 = 0, $1328 = 0, $1329 = 0, $133 = 0, $1330 = 0, $1331 = 0, $1332 = 0;
 var $1333 = 0, $1334 = 0, $1335 = 0, $1336 = 0, $1337 = 0, $1338 = 0, $1339 = 0, $134 = 0, $1340 = 0, $1341 = 0, $1342 = 0, $1343 = 0, $1344 = 0, $1345 = 0, $1346 = 0, $1347 = 0, $1348 = 0, $1349 = 0, $135 = 0, $1350 = 0;
 var $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0;
 var $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0;
 var $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0;
 var $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0;
 var $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0;
 var $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0;
 var $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0;
 var $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0;
 var $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0;
 var $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0;
 var $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0;
 var $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0;
 var $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0;
 var $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0;
 var $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0;
 var $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0;
 var $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0;
 var $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0;
 var $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0;
 var $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0;
 var $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0;
 var $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0;
 var $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0;
 var $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0;
 var $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0;
 var $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0;
 var $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0;
 var $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0;
 var $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0;
 var $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0;
 var $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0;
 var $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0;
 var $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0;
 var $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0;
 var $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0;
 var $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0;
 var $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0;
 var $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0;
 var $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0;
 var $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0;
 var $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0;
 var $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0;
 var $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0;
 var $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0;
 var $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0;
 var $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0;
 var $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0;
 var $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 1920|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(1920|0);
 $$byval_copy12 = sp + 1900|0;
 $$byval_copy11 = sp + 1896|0;
 $$byval_copy10 = sp + 1892|0;
 $$byval_copy9 = sp + 1888|0;
 $$byval_copy8 = sp + 1884|0;
 $$byval_copy = sp + 1880|0;
 $21 = sp + 1796|0;
 $27 = sp + 1772|0;
 $33 = sp + 1748|0;
 $45 = sp + 1700|0;
 $51 = sp + 80|0;
 $54 = sp + 1911|0;
 $82 = sp + 1560|0;
 $83 = sp + 1556|0;
 $84 = sp + 1536|0;
 $85 = sp + 1532|0;
 $88 = sp + 1520|0;
 $97 = sp + 1484|0;
 $98 = sp + 72|0;
 $101 = sp + 1472|0;
 $102 = sp + 1464|0;
 $103 = sp + 64|0;
 $106 = sp + 1448|0;
 $107 = sp + 1440|0;
 $108 = sp + 56|0;
 $127 = sp + 48|0;
 $130 = sp + 1910|0;
 $139 = sp + 40|0;
 $142 = sp + 1909|0;
 $148 = sp + 32|0;
 $151 = sp + 1908|0;
 $166 = sp + 1232|0;
 $172 = sp + 1208|0;
 $178 = sp + 1184|0;
 $190 = sp + 1136|0;
 $196 = sp + 24|0;
 $199 = sp + 1907|0;
 $227 = sp + 996|0;
 $228 = sp + 992|0;
 $229 = sp + 972|0;
 $230 = sp + 968|0;
 $233 = sp + 956|0;
 $261 = sp + 844|0;
 $267 = sp + 820|0;
 $273 = sp + 796|0;
 $285 = sp + 748|0;
 $291 = sp + 16|0;
 $294 = sp + 1906|0;
 $322 = sp + 608|0;
 $323 = sp + 604|0;
 $324 = sp + 584|0;
 $325 = sp + 580|0;
 $328 = sp + 568|0;
 $357 = sp + 452|0;
 $363 = sp + 428|0;
 $369 = sp + 404|0;
 $381 = sp + 356|0;
 $406 = sp + 8|0;
 $409 = sp + 1905|0;
 $415 = sp;
 $418 = sp + 1904|0;
 $433 = sp + 164|0;
 $434 = sp + 160|0;
 $435 = sp + 156|0;
 $436 = sp + 152|0;
 $437 = sp + 132|0;
 $438 = sp + 128|0;
 $439 = sp + 124|0;
 $440 = sp + 112|0;
 $443 = sp + 96|0;
 $444 = sp + 88|0;
 $431 = $0;
 $446 = $431;
 $430 = $446;
 $447 = $430;
 $448 = ((($447)) + 20|0);
 $429 = $448;
 $449 = $429;
 $428 = $449;
 $450 = $428;
 $432 = $450;
 $427 = $446;
 $451 = $427;
 $426 = $451;
 $452 = $426;
 $425 = $452;
 $453 = $425;
 $454 = ((($453)) + 8|0);
 $455 = HEAP32[$454>>2]|0;
 $456 = ((($453)) + 4|0);
 $457 = HEAP32[$456>>2]|0;
 $458 = $455;
 $459 = $457;
 $460 = (($458) - ($459))|0;
 $461 = (($460|0) / 4)&-1;
 $462 = ($461|0)==(0);
 if ($462) {
  $483 = 0;
 } else {
  $424 = $452;
  $463 = $424;
  $464 = ((($463)) + 8|0);
  $465 = HEAP32[$464>>2]|0;
  $466 = ((($463)) + 4|0);
  $467 = HEAP32[$466>>2]|0;
  $468 = $465;
  $469 = $467;
  $470 = (($468) - ($469))|0;
  $471 = (($470|0) / 4)&-1;
  $472 = $471<<10;
  $473 = (($472) - 1)|0;
  $483 = $473;
 }
 $474 = ((($451)) + 16|0);
 $475 = HEAP32[$474>>2]|0;
 $423 = $451;
 $476 = $423;
 $477 = ((($476)) + 20|0);
 $422 = $477;
 $478 = $422;
 $421 = $478;
 $479 = $421;
 $480 = HEAP32[$479>>2]|0;
 $481 = (($475) + ($480))|0;
 $482 = (($483) - ($481))|0;
 $484 = ($482>>>0)>=(1024);
 if ($484) {
  $485 = ((($446)) + 16|0);
  $486 = HEAP32[$485>>2]|0;
  $487 = (($486) + 1024)|0;
  HEAP32[$485>>2] = $487;
  $420 = $446;
  $488 = $420;
  $489 = ((($488)) + 8|0);
  $490 = HEAP32[$489>>2]|0;
  $491 = ((($490)) + -4|0);
  $492 = HEAP32[$491>>2]|0;
  HEAP32[$433>>2] = $492;
  $419 = $446;
  $493 = $419;
  $494 = ((($493)) + 8|0);
  $495 = HEAP32[$494>>2]|0;
  $496 = ((($495)) + -4|0);
  $416 = $493;
  $417 = $496;
  $497 = $416;
  $498 = $417;
  ;HEAP8[$415>>0]=HEAP8[$418>>0]|0;
  $413 = $497;
  $414 = $498;
  $499 = $413;
  while(1) {
   $500 = $414;
   $501 = ((($499)) + 8|0);
   $502 = HEAP32[$501>>2]|0;
   $503 = ($500|0)!=($502|0);
   if (!($503)) {
    break;
   }
   $412 = $499;
   $504 = $412;
   $505 = ((($504)) + 12|0);
   $411 = $505;
   $506 = $411;
   $410 = $506;
   $507 = $410;
   $508 = ((($499)) + 8|0);
   $509 = HEAP32[$508>>2]|0;
   $510 = ((($509)) + -4|0);
   HEAP32[$508>>2] = $510;
   $403 = $510;
   $511 = $403;
   $407 = $507;
   $408 = $511;
   $512 = $407;
   $513 = $408;
   ;HEAP8[$406>>0]=HEAP8[$409>>0]|0;
   $404 = $512;
   $405 = $513;
  }
  __ZNSt3__214__split_bufferIPiNS_9allocatorIS1_EEE10push_frontERKS1_($446,$433);
  STACKTOP = sp;return;
 }
 $383 = $446;
 $514 = $383;
 $515 = ((($514)) + 8|0);
 $516 = HEAP32[$515>>2]|0;
 $517 = ((($514)) + 4|0);
 $518 = HEAP32[$517>>2]|0;
 $519 = $516;
 $520 = $518;
 $521 = (($519) - ($520))|0;
 $522 = (($521|0) / 4)&-1;
 $332 = $446;
 $523 = $332;
 $331 = $523;
 $524 = $331;
 $525 = ((($524)) + 12|0);
 $330 = $525;
 $526 = $330;
 $329 = $526;
 $527 = $329;
 $528 = HEAP32[$527>>2]|0;
 $529 = HEAP32[$523>>2]|0;
 $530 = $528;
 $531 = $529;
 $532 = (($530) - ($531))|0;
 $533 = (($532|0) / 4)&-1;
 $534 = ($522>>>0)<($533>>>0);
 if ($534) {
  $248 = $446;
  $535 = $248;
  $536 = ((($535)) + 4|0);
  $537 = HEAP32[$536>>2]|0;
  $538 = HEAP32[$535>>2]|0;
  $539 = $537;
  $540 = $538;
  $541 = (($539) - ($540))|0;
  $542 = (($541|0) / 4)&-1;
  $543 = ($542>>>0)>(0);
  $544 = $432;
  do {
   if ($543) {
    $246 = $544;
    $247 = 1024;
    $545 = $246;
    $546 = $247;
    $243 = $545;
    $244 = $546;
    $245 = 0;
    $547 = $243;
    $548 = $244;
    $242 = $547;
    $549 = ($548>>>0)>(1073741823);
    if ($549) {
     $550 = (___cxa_allocate_exception(4)|0);
     __ZNSt9bad_allocC2Ev($550);
     ___cxa_throw(($550|0),(72|0),(19|0));
     // unreachable;
    } else {
     $551 = $244;
     $552 = $551<<2;
     $241 = $552;
     $553 = $241;
     $554 = (__Znwj($553)|0);
     HEAP32[$434>>2] = $554;
     __ZNSt3__214__split_bufferIPiNS_9allocatorIS1_EEE10push_frontERKS1_($446,$434);
     break;
    }
   } else {
    $239 = $544;
    $240 = 1024;
    $555 = $239;
    $556 = $240;
    $236 = $555;
    $237 = $556;
    $238 = 0;
    $557 = $236;
    $558 = $237;
    $235 = $557;
    $559 = ($558>>>0)>(1073741823);
    if ($559) {
     $560 = (___cxa_allocate_exception(4)|0);
     __ZNSt9bad_allocC2Ev($560);
     ___cxa_throw(($560|0),(72|0),(19|0));
     // unreachable;
    }
    $561 = $237;
    $562 = $561<<2;
    $234 = $562;
    $563 = $234;
    $564 = (__Znwj($563)|0);
    HEAP32[$435>>2] = $564;
    $223 = $446;
    $224 = $435;
    $565 = $223;
    $566 = ((($565)) + 8|0);
    $567 = HEAP32[$566>>2]|0;
    $222 = $565;
    $568 = $222;
    $569 = ((($568)) + 12|0);
    $221 = $569;
    $570 = $221;
    $220 = $570;
    $571 = $220;
    $572 = HEAP32[$571>>2]|0;
    $573 = ($567|0)==($572|0);
    do {
     if ($573) {
      $574 = ((($565)) + 4|0);
      $575 = HEAP32[$574>>2]|0;
      $576 = HEAP32[$565>>2]|0;
      $577 = ($575>>>0)>($576>>>0);
      if ($577) {
       $578 = ((($565)) + 4|0);
       $579 = HEAP32[$578>>2]|0;
       $580 = HEAP32[$565>>2]|0;
       $581 = $579;
       $582 = $580;
       $583 = (($581) - ($582))|0;
       $584 = (($583|0) / 4)&-1;
       $225 = $584;
       $585 = $225;
       $586 = (($585) + 1)|0;
       $587 = (($586|0) / 2)&-1;
       $225 = $587;
       $588 = ((($565)) + 4|0);
       $589 = HEAP32[$588>>2]|0;
       $590 = ((($565)) + 8|0);
       $591 = HEAP32[$590>>2]|0;
       $592 = ((($565)) + 4|0);
       $593 = HEAP32[$592>>2]|0;
       $594 = $225;
       $595 = (0 - ($594))|0;
       $596 = (($593) + ($595<<2)|0);
       $217 = $589;
       $218 = $591;
       $219 = $596;
       $597 = $217;
       $216 = $597;
       $598 = $216;
       $599 = $218;
       $210 = $599;
       $600 = $210;
       $601 = $219;
       $211 = $601;
       $602 = $211;
       $212 = $598;
       $213 = $600;
       $214 = $602;
       $603 = $213;
       $604 = $212;
       $605 = $603;
       $606 = $604;
       $607 = (($605) - ($606))|0;
       $608 = (($607|0) / 4)&-1;
       $215 = $608;
       $609 = $215;
       $610 = ($609>>>0)>(0);
       if ($610) {
        $611 = $214;
        $612 = $212;
        $613 = $215;
        $614 = $613<<2;
        _memmove(($611|0),($612|0),($614|0))|0;
       }
       $615 = $214;
       $616 = $215;
       $617 = (($615) + ($616<<2)|0);
       $618 = ((($565)) + 8|0);
       HEAP32[$618>>2] = $617;
       $619 = $225;
       $620 = ((($565)) + 4|0);
       $621 = HEAP32[$620>>2]|0;
       $622 = (0 - ($619))|0;
       $623 = (($621) + ($622<<2)|0);
       HEAP32[$620>>2] = $623;
       break;
      }
      $202 = $565;
      $624 = $202;
      $625 = ((($624)) + 12|0);
      $201 = $625;
      $626 = $201;
      $200 = $626;
      $627 = $200;
      $628 = HEAP32[$627>>2]|0;
      $629 = HEAP32[$565>>2]|0;
      $630 = $628;
      $631 = $629;
      $632 = (($630) - ($631))|0;
      $633 = (($632|0) / 4)&-1;
      $634 = $633<<1;
      HEAP32[$227>>2] = $634;
      HEAP32[$228>>2] = 1;
      $197 = $227;
      $198 = $228;
      $635 = $197;
      $636 = $198;
      ;HEAP8[$196>>0]=HEAP8[$199>>0]|0;
      $194 = $635;
      $195 = $636;
      $637 = $194;
      $638 = $195;
      $191 = $196;
      $192 = $637;
      $193 = $638;
      $639 = $192;
      $640 = HEAP32[$639>>2]|0;
      $641 = $193;
      $642 = HEAP32[$641>>2]|0;
      $643 = ($640>>>0)<($642>>>0);
      $644 = $195;
      $645 = $194;
      $646 = $643 ? $644 : $645;
      $647 = HEAP32[$646>>2]|0;
      $226 = $647;
      $648 = $226;
      $649 = $226;
      $650 = (($649>>>0) / 4)&-1;
      $160 = $565;
      $651 = $160;
      $652 = ((($651)) + 12|0);
      $159 = $652;
      $653 = $159;
      $158 = $653;
      $654 = $158;
      __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEEC2EjjS4_($229,$648,$650,$654);
      $655 = ((($565)) + 4|0);
      $656 = HEAP32[$655>>2]|0;
      $154 = $230;
      $155 = $656;
      $657 = $154;
      $658 = $155;
      HEAP32[$657>>2] = $658;
      $659 = ((($565)) + 8|0);
      $660 = HEAP32[$659>>2]|0;
      $156 = $233;
      $157 = $660;
      $661 = $156;
      $662 = $157;
      HEAP32[$661>>2] = $662;
      __THREW__ = 0;
      ;HEAP32[$$byval_copy>>2]=HEAP32[$230>>2]|0;
      ;HEAP32[$$byval_copy8>>2]=HEAP32[$233>>2]|0;
      invoke_viii(52,($229|0),($$byval_copy|0),($$byval_copy8|0));
      $663 = __THREW__; __THREW__ = 0;
      $664 = $663&1;
      if (!($664)) {
       $164 = $565;
       $165 = $229;
       $665 = $164;
       $163 = $665;
       $666 = $163;
       $667 = HEAP32[$666>>2]|0;
       HEAP32[$166>>2] = $667;
       $668 = $165;
       $161 = $668;
       $669 = $161;
       $670 = HEAP32[$669>>2]|0;
       $671 = $164;
       HEAP32[$671>>2] = $670;
       $162 = $166;
       $672 = $162;
       $673 = HEAP32[$672>>2]|0;
       $674 = $165;
       HEAP32[$674>>2] = $673;
       $675 = ((($565)) + 4|0);
       $676 = ((($229)) + 4|0);
       $170 = $675;
       $171 = $676;
       $677 = $170;
       $169 = $677;
       $678 = $169;
       $679 = HEAP32[$678>>2]|0;
       HEAP32[$172>>2] = $679;
       $680 = $171;
       $167 = $680;
       $681 = $167;
       $682 = HEAP32[$681>>2]|0;
       $683 = $170;
       HEAP32[$683>>2] = $682;
       $168 = $172;
       $684 = $168;
       $685 = HEAP32[$684>>2]|0;
       $686 = $171;
       HEAP32[$686>>2] = $685;
       $687 = ((($565)) + 8|0);
       $688 = ((($229)) + 8|0);
       $176 = $687;
       $177 = $688;
       $689 = $176;
       $175 = $689;
       $690 = $175;
       $691 = HEAP32[$690>>2]|0;
       HEAP32[$178>>2] = $691;
       $692 = $177;
       $173 = $692;
       $693 = $173;
       $694 = HEAP32[$693>>2]|0;
       $695 = $176;
       HEAP32[$695>>2] = $694;
       $174 = $178;
       $696 = $174;
       $697 = HEAP32[$696>>2]|0;
       $698 = $177;
       HEAP32[$698>>2] = $697;
       $181 = $565;
       $699 = $181;
       $700 = ((($699)) + 12|0);
       $180 = $700;
       $701 = $180;
       $179 = $701;
       $702 = $179;
       $184 = $229;
       $703 = $184;
       $704 = ((($703)) + 12|0);
       $183 = $704;
       $705 = $183;
       $182 = $705;
       $706 = $182;
       $188 = $702;
       $189 = $706;
       $707 = $188;
       $187 = $707;
       $708 = $187;
       $709 = HEAP32[$708>>2]|0;
       HEAP32[$190>>2] = $709;
       $710 = $189;
       $185 = $710;
       $711 = $185;
       $712 = HEAP32[$711>>2]|0;
       $713 = $188;
       HEAP32[$713>>2] = $712;
       $186 = $190;
       $714 = $186;
       $715 = HEAP32[$714>>2]|0;
       $716 = $189;
       HEAP32[$716>>2] = $715;
       __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEED2Ev($229);
       break;
      }
      $717 = ___cxa_find_matching_catch_2()|0;
      $718 = tempRet0;
      $231 = $717;
      $232 = $718;
      __THREW__ = 0;
      invoke_vi(53,($229|0));
      $719 = __THREW__; __THREW__ = 0;
      $720 = $719&1;
      if ($720) {
       $723 = ___cxa_find_matching_catch_3(0|0)|0;
       $724 = tempRet0;
       ___clang_call_terminate($723);
       // unreachable;
      } else {
       $721 = $231;
       $722 = $232;
       ___resumeException($721|0);
       // unreachable;
      }
     }
    } while(0);
    $205 = $565;
    $725 = $205;
    $726 = ((($725)) + 12|0);
    $204 = $726;
    $727 = $204;
    $203 = $727;
    $728 = $203;
    $729 = ((($565)) + 8|0);
    $730 = HEAP32[$729>>2]|0;
    $206 = $730;
    $731 = $206;
    $732 = $224;
    $207 = $728;
    $208 = $731;
    $209 = $732;
    $733 = $208;
    $734 = $209;
    $735 = HEAP32[$734>>2]|0;
    HEAP32[$733>>2] = $735;
    $736 = ((($565)) + 8|0);
    $737 = HEAP32[$736>>2]|0;
    $738 = ((($737)) + 4|0);
    HEAP32[$736>>2] = $738;
    $153 = $446;
    $739 = $153;
    $740 = ((($739)) + 8|0);
    $741 = HEAP32[$740>>2]|0;
    $742 = ((($741)) + -4|0);
    $743 = HEAP32[$742>>2]|0;
    HEAP32[$436>>2] = $743;
    $152 = $446;
    $744 = $152;
    $745 = ((($744)) + 8|0);
    $746 = HEAP32[$745>>2]|0;
    $747 = ((($746)) + -4|0);
    $149 = $744;
    $150 = $747;
    $748 = $149;
    $749 = $150;
    ;HEAP8[$148>>0]=HEAP8[$151>>0]|0;
    $146 = $748;
    $147 = $749;
    $750 = $146;
    while(1) {
     $751 = $147;
     $752 = ((($750)) + 8|0);
     $753 = HEAP32[$752>>2]|0;
     $754 = ($751|0)!=($753|0);
     if (!($754)) {
      break;
     }
     $145 = $750;
     $755 = $145;
     $756 = ((($755)) + 12|0);
     $144 = $756;
     $757 = $144;
     $143 = $757;
     $758 = $143;
     $759 = ((($750)) + 8|0);
     $760 = HEAP32[$759>>2]|0;
     $761 = ((($760)) + -4|0);
     HEAP32[$759>>2] = $761;
     $136 = $761;
     $762 = $136;
     $140 = $758;
     $141 = $762;
     $763 = $140;
     $764 = $141;
     ;HEAP8[$139>>0]=HEAP8[$142>>0]|0;
     $137 = $763;
     $138 = $764;
    }
    __ZNSt3__214__split_bufferIPiNS_9allocatorIS1_EEE10push_frontERKS1_($446,$436);
   }
  } while(0);
  $135 = $446;
  $765 = $135;
  $766 = ((($765)) + 8|0);
  $767 = HEAP32[$766>>2]|0;
  $768 = ((($765)) + 4|0);
  $769 = HEAP32[$768>>2]|0;
  $770 = $767;
  $771 = $769;
  $772 = (($770) - ($771))|0;
  $773 = (($772|0) / 4)&-1;
  $774 = ($773|0)==(1);
  if ($774) {
   $779 = 512;
  } else {
   $775 = ((($446)) + 16|0);
   $776 = HEAP32[$775>>2]|0;
   $777 = (($776) + 1024)|0;
   $779 = $777;
  }
  $778 = ((($446)) + 16|0);
  HEAP32[$778>>2] = $779;
  STACKTOP = sp;return;
 }
 $134 = $446;
 $780 = $134;
 $133 = $780;
 $781 = $133;
 $782 = ((($781)) + 12|0);
 $132 = $782;
 $783 = $132;
 $131 = $783;
 $784 = $131;
 $785 = HEAP32[$784>>2]|0;
 $786 = HEAP32[$780>>2]|0;
 $787 = $785;
 $788 = $786;
 $789 = (($787) - ($788))|0;
 $790 = (($789|0) / 4)&-1;
 $791 = $790<<1;
 HEAP32[$438>>2] = $791;
 HEAP32[$439>>2] = 1;
 $128 = $438;
 $129 = $439;
 $792 = $128;
 $793 = $129;
 ;HEAP8[$127>>0]=HEAP8[$130>>0]|0;
 $125 = $792;
 $126 = $793;
 $794 = $125;
 $795 = $126;
 $122 = $127;
 $123 = $794;
 $124 = $795;
 $796 = $123;
 $797 = HEAP32[$796>>2]|0;
 $798 = $124;
 $799 = HEAP32[$798>>2]|0;
 $800 = ($797>>>0)<($799>>>0);
 $801 = $126;
 $802 = $125;
 $803 = $800 ? $801 : $802;
 $804 = HEAP32[$803>>2]|0;
 $121 = $446;
 $805 = $121;
 $806 = ((($805)) + 12|0);
 $120 = $806;
 $807 = $120;
 $119 = $807;
 $808 = $119;
 __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEEC2EjjS4_($437,$804,0,$808);
 $809 = $432;
 $117 = $809;
 $118 = 1024;
 $810 = $117;
 $811 = $118;
 $114 = $810;
 $115 = $811;
 $116 = 0;
 $812 = $114;
 $813 = $115;
 $113 = $812;
 $814 = ($813>>>0)>(1073741823);
 if ($814) {
  $815 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($815);
  __THREW__ = 0;
  invoke_viii(49,($815|0),(72|0),(19|0));
  $816 = __THREW__; __THREW__ = 0;
  label = 60;
 } else {
  $817 = $115;
  $818 = $817<<2;
  $112 = $818;
  $819 = $112;
  __THREW__ = 0;
  $820 = (invoke_ii(50,($819|0))|0);
  $821 = __THREW__; __THREW__ = 0;
  $822 = $821&1;
  if ($822) {
   label = 60;
  } else {
   $823 = $432;
   $109 = $443;
   $110 = $823;
   $111 = 1024;
   $824 = $109;
   $825 = $110;
   HEAP32[$824>>2] = $825;
   $826 = ((($824)) + 4|0);
   $827 = $111;
   HEAP32[$826>>2] = $827;
   ;HEAP8[$108>>0]=HEAP8[$443>>0]|0;HEAP8[$108+1>>0]=HEAP8[$443+1>>0]|0;HEAP8[$108+2>>0]=HEAP8[$443+2>>0]|0;HEAP8[$108+3>>0]=HEAP8[$443+3>>0]|0;HEAP8[$108+4>>0]=HEAP8[$443+4>>0]|0;HEAP8[$108+5>>0]=HEAP8[$443+5>>0]|0;HEAP8[$108+6>>0]=HEAP8[$443+6>>0]|0;HEAP8[$108+7>>0]=HEAP8[$443+7>>0]|0;
   $105 = $440;
   HEAP32[$106>>2] = $820;
   $828 = $105;
   $104 = $106;
   $829 = $104;
   $830 = HEAP32[$829>>2]|0;
   $92 = $108;
   $831 = $92;
   ;HEAP32[$107>>2]=HEAP32[$831>>2]|0;HEAP32[$107+4>>2]=HEAP32[$831+4>>2]|0;
   ;HEAP8[$103>>0]=HEAP8[$107>>0]|0;HEAP8[$103+1>>0]=HEAP8[$107+1>>0]|0;HEAP8[$103+2>>0]=HEAP8[$107+2>>0]|0;HEAP8[$103+3>>0]=HEAP8[$107+3>>0]|0;HEAP8[$103+4>>0]=HEAP8[$107+4>>0]|0;HEAP8[$103+5>>0]=HEAP8[$107+5>>0]|0;HEAP8[$103+6>>0]=HEAP8[$107+6>>0]|0;HEAP8[$103+7>>0]=HEAP8[$107+7>>0]|0;
   $100 = $828;
   HEAP32[$101>>2] = $830;
   $832 = $100;
   $99 = $101;
   $833 = $99;
   $834 = HEAP32[$833>>2]|0;
   $93 = $103;
   $835 = $93;
   ;HEAP32[$102>>2]=HEAP32[$835>>2]|0;HEAP32[$102+4>>2]=HEAP32[$835+4>>2]|0;
   ;HEAP8[$98>>0]=HEAP8[$102>>0]|0;HEAP8[$98+1>>0]=HEAP8[$102+1>>0]|0;HEAP8[$98+2>>0]=HEAP8[$102+2>>0]|0;HEAP8[$98+3>>0]=HEAP8[$102+3>>0]|0;HEAP8[$98+4>>0]=HEAP8[$102+4>>0]|0;HEAP8[$98+5>>0]=HEAP8[$102+5>>0]|0;HEAP8[$98+6>>0]=HEAP8[$102+6>>0]|0;HEAP8[$98+7>>0]=HEAP8[$102+7>>0]|0;
   $96 = $832;
   HEAP32[$97>>2] = $834;
   $836 = $96;
   $95 = $97;
   $837 = $95;
   $838 = HEAP32[$837>>2]|0;
   HEAP32[$836>>2] = $838;
   $839 = ((($836)) + 4|0);
   $94 = $98;
   $840 = $94;
   ;HEAP32[$839>>2]=HEAP32[$840>>2]|0;HEAP32[$839+4>>2]=HEAP32[$840+4>>2]|0;
   $91 = $440;
   $841 = $91;
   $90 = $841;
   $842 = $90;
   $89 = $842;
   $843 = $89;
   $844 = HEAP32[$843>>2]|0;
   HEAP32[$444>>2] = $844;
   $78 = $437;
   $79 = $444;
   $845 = $78;
   $846 = ((($845)) + 8|0);
   $847 = HEAP32[$846>>2]|0;
   $77 = $845;
   $848 = $77;
   $849 = ((($848)) + 12|0);
   $76 = $849;
   $850 = $76;
   $75 = $850;
   $851 = $75;
   $852 = HEAP32[$851>>2]|0;
   $853 = ($847|0)==($852|0);
   do {
    if ($853) {
     $854 = ((($845)) + 4|0);
     $855 = HEAP32[$854>>2]|0;
     $856 = HEAP32[$845>>2]|0;
     $857 = ($855>>>0)>($856>>>0);
     if ($857) {
      $858 = ((($845)) + 4|0);
      $859 = HEAP32[$858>>2]|0;
      $860 = HEAP32[$845>>2]|0;
      $861 = $859;
      $862 = $860;
      $863 = (($861) - ($862))|0;
      $864 = (($863|0) / 4)&-1;
      $80 = $864;
      $865 = $80;
      $866 = (($865) + 1)|0;
      $867 = (($866|0) / 2)&-1;
      $80 = $867;
      $868 = ((($845)) + 4|0);
      $869 = HEAP32[$868>>2]|0;
      $870 = ((($845)) + 8|0);
      $871 = HEAP32[$870>>2]|0;
      $872 = ((($845)) + 4|0);
      $873 = HEAP32[$872>>2]|0;
      $874 = $80;
      $875 = (0 - ($874))|0;
      $876 = (($873) + ($875<<2)|0);
      $72 = $869;
      $73 = $871;
      $74 = $876;
      $877 = $72;
      $71 = $877;
      $878 = $71;
      $879 = $73;
      $65 = $879;
      $880 = $65;
      $881 = $74;
      $66 = $881;
      $882 = $66;
      $67 = $878;
      $68 = $880;
      $69 = $882;
      $883 = $68;
      $884 = $67;
      $885 = $883;
      $886 = $884;
      $887 = (($885) - ($886))|0;
      $888 = (($887|0) / 4)&-1;
      $70 = $888;
      $889 = $70;
      $890 = ($889>>>0)>(0);
      if ($890) {
       $891 = $69;
       $892 = $67;
       $893 = $70;
       $894 = $893<<2;
       _memmove(($891|0),($892|0),($894|0))|0;
      }
      $895 = $69;
      $896 = $70;
      $897 = (($895) + ($896<<2)|0);
      $898 = ((($845)) + 8|0);
      HEAP32[$898>>2] = $897;
      $899 = $80;
      $900 = ((($845)) + 4|0);
      $901 = HEAP32[$900>>2]|0;
      $902 = (0 - ($899))|0;
      $903 = (($901) + ($902<<2)|0);
      HEAP32[$900>>2] = $903;
      label = 46;
      break;
     }
     $57 = $845;
     $904 = $57;
     $905 = ((($904)) + 12|0);
     $56 = $905;
     $906 = $56;
     $55 = $906;
     $907 = $55;
     $908 = HEAP32[$907>>2]|0;
     $909 = HEAP32[$845>>2]|0;
     $910 = $908;
     $911 = $909;
     $912 = (($910) - ($911))|0;
     $913 = (($912|0) / 4)&-1;
     $914 = $913<<1;
     HEAP32[$82>>2] = $914;
     HEAP32[$83>>2] = 1;
     $52 = $82;
     $53 = $83;
     $915 = $52;
     $916 = $53;
     ;HEAP8[$51>>0]=HEAP8[$54>>0]|0;
     $49 = $915;
     $50 = $916;
     $917 = $49;
     $918 = $50;
     $46 = $51;
     $47 = $917;
     $48 = $918;
     $919 = $47;
     $920 = HEAP32[$919>>2]|0;
     $921 = $48;
     $922 = HEAP32[$921>>2]|0;
     $923 = ($920>>>0)<($922>>>0);
     $924 = $50;
     $925 = $49;
     $926 = $923 ? $924 : $925;
     $927 = HEAP32[$926>>2]|0;
     $81 = $927;
     $928 = $81;
     $929 = $81;
     $930 = (($929>>>0) / 4)&-1;
     $15 = $845;
     $931 = $15;
     $932 = ((($931)) + 12|0);
     $14 = $932;
     $933 = $14;
     $13 = $933;
     $934 = $13;
     $935 = ((($934)) + 4|0);
     $936 = HEAP32[$935>>2]|0;
     __THREW__ = 0;
     invoke_viiii(54,($84|0),($928|0),($930|0),($936|0));
     $937 = __THREW__; __THREW__ = 0;
     $938 = $937&1;
     if ($938) {
      label = 61;
     } else {
      $939 = ((($845)) + 4|0);
      $940 = HEAP32[$939>>2]|0;
      $9 = $85;
      $10 = $940;
      $941 = $9;
      $942 = $10;
      HEAP32[$941>>2] = $942;
      $943 = ((($845)) + 8|0);
      $944 = HEAP32[$943>>2]|0;
      $11 = $88;
      $12 = $944;
      $945 = $11;
      $946 = $12;
      HEAP32[$945>>2] = $946;
      __THREW__ = 0;
      ;HEAP32[$$byval_copy9>>2]=HEAP32[$85>>2]|0;
      ;HEAP32[$$byval_copy10>>2]=HEAP32[$88>>2]|0;
      invoke_viii(52,($84|0),($$byval_copy9|0),($$byval_copy10|0));
      $947 = __THREW__; __THREW__ = 0;
      $948 = $947&1;
      if (!($948)) {
       $19 = $845;
       $20 = $84;
       $949 = $19;
       $18 = $949;
       $950 = $18;
       $951 = HEAP32[$950>>2]|0;
       HEAP32[$21>>2] = $951;
       $952 = $20;
       $16 = $952;
       $953 = $16;
       $954 = HEAP32[$953>>2]|0;
       $955 = $19;
       HEAP32[$955>>2] = $954;
       $17 = $21;
       $956 = $17;
       $957 = HEAP32[$956>>2]|0;
       $958 = $20;
       HEAP32[$958>>2] = $957;
       $959 = ((($845)) + 4|0);
       $960 = ((($84)) + 4|0);
       $25 = $959;
       $26 = $960;
       $961 = $25;
       $24 = $961;
       $962 = $24;
       $963 = HEAP32[$962>>2]|0;
       HEAP32[$27>>2] = $963;
       $964 = $26;
       $22 = $964;
       $965 = $22;
       $966 = HEAP32[$965>>2]|0;
       $967 = $25;
       HEAP32[$967>>2] = $966;
       $23 = $27;
       $968 = $23;
       $969 = HEAP32[$968>>2]|0;
       $970 = $26;
       HEAP32[$970>>2] = $969;
       $971 = ((($845)) + 8|0);
       $972 = ((($84)) + 8|0);
       $31 = $971;
       $32 = $972;
       $973 = $31;
       $30 = $973;
       $974 = $30;
       $975 = HEAP32[$974>>2]|0;
       HEAP32[$33>>2] = $975;
       $976 = $32;
       $28 = $976;
       $977 = $28;
       $978 = HEAP32[$977>>2]|0;
       $979 = $31;
       HEAP32[$979>>2] = $978;
       $29 = $33;
       $980 = $29;
       $981 = HEAP32[$980>>2]|0;
       $982 = $32;
       HEAP32[$982>>2] = $981;
       $36 = $845;
       $983 = $36;
       $984 = ((($983)) + 12|0);
       $35 = $984;
       $985 = $35;
       $34 = $985;
       $986 = $34;
       $39 = $84;
       $987 = $39;
       $988 = ((($987)) + 12|0);
       $38 = $988;
       $989 = $38;
       $37 = $989;
       $990 = $37;
       $43 = $986;
       $44 = $990;
       $991 = $43;
       $42 = $991;
       $992 = $42;
       $993 = HEAP32[$992>>2]|0;
       HEAP32[$45>>2] = $993;
       $994 = $44;
       $40 = $994;
       $995 = $40;
       $996 = HEAP32[$995>>2]|0;
       $997 = $43;
       HEAP32[$997>>2] = $996;
       $41 = $45;
       $998 = $41;
       $999 = HEAP32[$998>>2]|0;
       $1000 = $44;
       HEAP32[$1000>>2] = $999;
       __THREW__ = 0;
       invoke_vi(53,($84|0));
       $1001 = __THREW__; __THREW__ = 0;
       $1002 = $1001&1;
       if ($1002) {
        label = 61;
        break;
       } else {
        label = 46;
        break;
       }
      }
      $1003 = ___cxa_find_matching_catch_2()|0;
      $1004 = tempRet0;
      $86 = $1003;
      $87 = $1004;
      __THREW__ = 0;
      invoke_vi(53,($84|0));
      $1005 = __THREW__; __THREW__ = 0;
      $1006 = $1005&1;
      if ($1006) {
       $1009 = ___cxa_find_matching_catch_3(0|0)|0;
       $1010 = tempRet0;
       ___clang_call_terminate($1009);
       // unreachable;
      } else {
       $1007 = $86;
       $1008 = $87;
       $$index = $1007;$$index3 = $1008;
       break;
      }
     }
    } else {
     label = 46;
    }
   } while(0);
   L67: do {
    if ((label|0) == 46) {
     $60 = $845;
     $1011 = $60;
     $1012 = ((($1011)) + 12|0);
     $59 = $1012;
     $1013 = $59;
     $58 = $1013;
     $1014 = $58;
     $1015 = ((($1014)) + 4|0);
     $1016 = HEAP32[$1015>>2]|0;
     $1017 = ((($845)) + 8|0);
     $1018 = HEAP32[$1017>>2]|0;
     $61 = $1018;
     $1019 = $61;
     $1020 = $79;
     $62 = $1016;
     $63 = $1019;
     $64 = $1020;
     $1021 = $63;
     $1022 = $64;
     $1023 = HEAP32[$1022>>2]|0;
     HEAP32[$1021>>2] = $1023;
     $1024 = ((($845)) + 8|0);
     $1025 = HEAP32[$1024>>2]|0;
     $1026 = ((($1025)) + 4|0);
     HEAP32[$1024>>2] = $1026;
     $7 = $440;
     $1027 = $7;
     $6 = $1027;
     $1028 = $6;
     $5 = $1028;
     $1029 = $5;
     $1030 = HEAP32[$1029>>2]|0;
     $8 = $1030;
     $4 = $1027;
     $1031 = $4;
     $3 = $1031;
     $1032 = $3;
     HEAP32[$1032>>2] = 0;
     $2 = $446;
     $1033 = $2;
     $1034 = ((($1033)) + 4|0);
     $1035 = HEAP32[$1034>>2]|0;
     $445 = $1035;
     L69: while(1) {
      $1036 = $445;
      $1 = $446;
      $1037 = $1;
      $1038 = ((($1037)) + 8|0);
      $1039 = HEAP32[$1038>>2]|0;
      $1040 = ($1036|0)!=($1039|0);
      if (!($1040)) {
       break;
      }
      $1041 = $445;
      $318 = $437;
      $319 = $1041;
      $1042 = $318;
      $1043 = ((($1042)) + 8|0);
      $1044 = HEAP32[$1043>>2]|0;
      $317 = $1042;
      $1045 = $317;
      $1046 = ((($1045)) + 12|0);
      $316 = $1046;
      $1047 = $316;
      $315 = $1047;
      $1048 = $315;
      $1049 = HEAP32[$1048>>2]|0;
      $1050 = ($1044|0)==($1049|0);
      do {
       if ($1050) {
        $1051 = ((($1042)) + 4|0);
        $1052 = HEAP32[$1051>>2]|0;
        $1053 = HEAP32[$1042>>2]|0;
        $1054 = ($1052>>>0)>($1053>>>0);
        if ($1054) {
         $1055 = ((($1042)) + 4|0);
         $1056 = HEAP32[$1055>>2]|0;
         $1057 = HEAP32[$1042>>2]|0;
         $1058 = $1056;
         $1059 = $1057;
         $1060 = (($1058) - ($1059))|0;
         $1061 = (($1060|0) / 4)&-1;
         $320 = $1061;
         $1062 = $320;
         $1063 = (($1062) + 1)|0;
         $1064 = (($1063|0) / 2)&-1;
         $320 = $1064;
         $1065 = ((($1042)) + 4|0);
         $1066 = HEAP32[$1065>>2]|0;
         $1067 = ((($1042)) + 8|0);
         $1068 = HEAP32[$1067>>2]|0;
         $1069 = ((($1042)) + 4|0);
         $1070 = HEAP32[$1069>>2]|0;
         $1071 = $320;
         $1072 = (0 - ($1071))|0;
         $1073 = (($1070) + ($1072<<2)|0);
         $312 = $1066;
         $313 = $1068;
         $314 = $1073;
         $1074 = $312;
         $311 = $1074;
         $1075 = $311;
         $1076 = $313;
         $305 = $1076;
         $1077 = $305;
         $1078 = $314;
         $306 = $1078;
         $1079 = $306;
         $307 = $1075;
         $308 = $1077;
         $309 = $1079;
         $1080 = $308;
         $1081 = $307;
         $1082 = $1080;
         $1083 = $1081;
         $1084 = (($1082) - ($1083))|0;
         $1085 = (($1084|0) / 4)&-1;
         $310 = $1085;
         $1086 = $310;
         $1087 = ($1086>>>0)>(0);
         if ($1087) {
          $1088 = $309;
          $1089 = $307;
          $1090 = $310;
          $1091 = $1090<<2;
          _memmove(($1088|0),($1089|0),($1091|0))|0;
         }
         $1092 = $309;
         $1093 = $310;
         $1094 = (($1092) + ($1093<<2)|0);
         $1095 = ((($1042)) + 8|0);
         HEAP32[$1095>>2] = $1094;
         $1096 = $320;
         $1097 = ((($1042)) + 4|0);
         $1098 = HEAP32[$1097>>2]|0;
         $1099 = (0 - ($1096))|0;
         $1100 = (($1098) + ($1099<<2)|0);
         HEAP32[$1097>>2] = $1100;
         break;
        } else {
         $297 = $1042;
         $1101 = $297;
         $1102 = ((($1101)) + 12|0);
         $296 = $1102;
         $1103 = $296;
         $295 = $1103;
         $1104 = $295;
         $1105 = HEAP32[$1104>>2]|0;
         $1106 = HEAP32[$1042>>2]|0;
         $1107 = $1105;
         $1108 = $1106;
         $1109 = (($1107) - ($1108))|0;
         $1110 = (($1109|0) / 4)&-1;
         $1111 = $1110<<1;
         HEAP32[$322>>2] = $1111;
         HEAP32[$323>>2] = 1;
         $292 = $322;
         $293 = $323;
         $1112 = $292;
         $1113 = $293;
         ;HEAP8[$291>>0]=HEAP8[$294>>0]|0;
         $289 = $1112;
         $290 = $1113;
         $1114 = $289;
         $1115 = $290;
         $286 = $291;
         $287 = $1114;
         $288 = $1115;
         $1116 = $287;
         $1117 = HEAP32[$1116>>2]|0;
         $1118 = $288;
         $1119 = HEAP32[$1118>>2]|0;
         $1120 = ($1117>>>0)<($1119>>>0);
         $1121 = $290;
         $1122 = $289;
         $1123 = $1120 ? $1121 : $1122;
         $1124 = HEAP32[$1123>>2]|0;
         $321 = $1124;
         $1125 = $321;
         $1126 = $321;
         $1127 = (($1126>>>0) / 4)&-1;
         $255 = $1042;
         $1128 = $255;
         $1129 = ((($1128)) + 12|0);
         $254 = $1129;
         $1130 = $254;
         $253 = $1130;
         $1131 = $253;
         $1132 = ((($1131)) + 4|0);
         $1133 = HEAP32[$1132>>2]|0;
         __THREW__ = 0;
         invoke_viiii(54,($324|0),($1125|0),($1127|0),($1133|0));
         $1134 = __THREW__; __THREW__ = 0;
         $1135 = $1134&1;
         if ($1135) {
          label = 61;
          break L67;
         }
         $1136 = ((($1042)) + 4|0);
         $1137 = HEAP32[$1136>>2]|0;
         $249 = $325;
         $250 = $1137;
         $1138 = $249;
         $1139 = $250;
         HEAP32[$1138>>2] = $1139;
         $1140 = ((($1042)) + 8|0);
         $1141 = HEAP32[$1140>>2]|0;
         $251 = $328;
         $252 = $1141;
         $1142 = $251;
         $1143 = $252;
         HEAP32[$1142>>2] = $1143;
         __THREW__ = 0;
         ;HEAP32[$$byval_copy11>>2]=HEAP32[$325>>2]|0;
         ;HEAP32[$$byval_copy12>>2]=HEAP32[$328>>2]|0;
         invoke_viii(52,($324|0),($$byval_copy11|0),($$byval_copy12|0));
         $1144 = __THREW__; __THREW__ = 0;
         $1145 = $1144&1;
         if ($1145) {
          label = 56;
          break L69;
         }
         $259 = $1042;
         $260 = $324;
         $1146 = $259;
         $258 = $1146;
         $1147 = $258;
         $1148 = HEAP32[$1147>>2]|0;
         HEAP32[$261>>2] = $1148;
         $1149 = $260;
         $256 = $1149;
         $1150 = $256;
         $1151 = HEAP32[$1150>>2]|0;
         $1152 = $259;
         HEAP32[$1152>>2] = $1151;
         $257 = $261;
         $1153 = $257;
         $1154 = HEAP32[$1153>>2]|0;
         $1155 = $260;
         HEAP32[$1155>>2] = $1154;
         $1156 = ((($1042)) + 4|0);
         $1157 = ((($324)) + 4|0);
         $265 = $1156;
         $266 = $1157;
         $1158 = $265;
         $264 = $1158;
         $1159 = $264;
         $1160 = HEAP32[$1159>>2]|0;
         HEAP32[$267>>2] = $1160;
         $1161 = $266;
         $262 = $1161;
         $1162 = $262;
         $1163 = HEAP32[$1162>>2]|0;
         $1164 = $265;
         HEAP32[$1164>>2] = $1163;
         $263 = $267;
         $1165 = $263;
         $1166 = HEAP32[$1165>>2]|0;
         $1167 = $266;
         HEAP32[$1167>>2] = $1166;
         $1168 = ((($1042)) + 8|0);
         $1169 = ((($324)) + 8|0);
         $271 = $1168;
         $272 = $1169;
         $1170 = $271;
         $270 = $1170;
         $1171 = $270;
         $1172 = HEAP32[$1171>>2]|0;
         HEAP32[$273>>2] = $1172;
         $1173 = $272;
         $268 = $1173;
         $1174 = $268;
         $1175 = HEAP32[$1174>>2]|0;
         $1176 = $271;
         HEAP32[$1176>>2] = $1175;
         $269 = $273;
         $1177 = $269;
         $1178 = HEAP32[$1177>>2]|0;
         $1179 = $272;
         HEAP32[$1179>>2] = $1178;
         $276 = $1042;
         $1180 = $276;
         $1181 = ((($1180)) + 12|0);
         $275 = $1181;
         $1182 = $275;
         $274 = $1182;
         $1183 = $274;
         $279 = $324;
         $1184 = $279;
         $1185 = ((($1184)) + 12|0);
         $278 = $1185;
         $1186 = $278;
         $277 = $1186;
         $1187 = $277;
         $283 = $1183;
         $284 = $1187;
         $1188 = $283;
         $282 = $1188;
         $1189 = $282;
         $1190 = HEAP32[$1189>>2]|0;
         HEAP32[$285>>2] = $1190;
         $1191 = $284;
         $280 = $1191;
         $1192 = $280;
         $1193 = HEAP32[$1192>>2]|0;
         $1194 = $283;
         HEAP32[$1194>>2] = $1193;
         $281 = $285;
         $1195 = $281;
         $1196 = HEAP32[$1195>>2]|0;
         $1197 = $284;
         HEAP32[$1197>>2] = $1196;
         __THREW__ = 0;
         invoke_vi(53,($324|0));
         $1198 = __THREW__; __THREW__ = 0;
         $1199 = $1198&1;
         if ($1199) {
          label = 61;
          break L67;
         } else {
          break;
         }
        }
       }
      } while(0);
      $300 = $1042;
      $1208 = $300;
      $1209 = ((($1208)) + 12|0);
      $299 = $1209;
      $1210 = $299;
      $298 = $1210;
      $1211 = $298;
      $1212 = ((($1211)) + 4|0);
      $1213 = HEAP32[$1212>>2]|0;
      $1214 = ((($1042)) + 8|0);
      $1215 = HEAP32[$1214>>2]|0;
      $301 = $1215;
      $1216 = $301;
      $1217 = $319;
      $302 = $1213;
      $303 = $1216;
      $304 = $1217;
      $1218 = $303;
      $1219 = $304;
      $1220 = HEAP32[$1219>>2]|0;
      HEAP32[$1218>>2] = $1220;
      $1221 = ((($1042)) + 8|0);
      $1222 = HEAP32[$1221>>2]|0;
      $1223 = ((($1222)) + 4|0);
      HEAP32[$1221>>2] = $1223;
      $1224 = $445;
      $1225 = ((($1224)) + 4|0);
      $445 = $1225;
     }
     if ((label|0) == 56) {
      $1200 = ___cxa_find_matching_catch_2()|0;
      $1201 = tempRet0;
      $326 = $1200;
      $327 = $1201;
      __THREW__ = 0;
      invoke_vi(53,($324|0));
      $1202 = __THREW__; __THREW__ = 0;
      $1203 = $1202&1;
      if ($1203) {
       $1206 = ___cxa_find_matching_catch_3(0|0)|0;
       $1207 = tempRet0;
       ___clang_call_terminate($1206);
       // unreachable;
      } else {
       $1204 = $326;
       $1205 = $327;
       $$index = $1204;$$index3 = $1205;
       break;
      }
     }
     $355 = $446;
     $356 = $437;
     $1254 = $355;
     $354 = $1254;
     $1255 = $354;
     $1256 = HEAP32[$1255>>2]|0;
     HEAP32[$357>>2] = $1256;
     $1257 = $356;
     $352 = $1257;
     $1258 = $352;
     $1259 = HEAP32[$1258>>2]|0;
     $1260 = $355;
     HEAP32[$1260>>2] = $1259;
     $353 = $357;
     $1261 = $353;
     $1262 = HEAP32[$1261>>2]|0;
     $1263 = $356;
     HEAP32[$1263>>2] = $1262;
     $1264 = ((($446)) + 4|0);
     $1265 = ((($437)) + 4|0);
     $361 = $1264;
     $362 = $1265;
     $1266 = $361;
     $360 = $1266;
     $1267 = $360;
     $1268 = HEAP32[$1267>>2]|0;
     HEAP32[$363>>2] = $1268;
     $1269 = $362;
     $358 = $1269;
     $1270 = $358;
     $1271 = HEAP32[$1270>>2]|0;
     $1272 = $361;
     HEAP32[$1272>>2] = $1271;
     $359 = $363;
     $1273 = $359;
     $1274 = HEAP32[$1273>>2]|0;
     $1275 = $362;
     HEAP32[$1275>>2] = $1274;
     $1276 = ((($446)) + 8|0);
     $1277 = ((($437)) + 8|0);
     $367 = $1276;
     $368 = $1277;
     $1278 = $367;
     $366 = $1278;
     $1279 = $366;
     $1280 = HEAP32[$1279>>2]|0;
     HEAP32[$369>>2] = $1280;
     $1281 = $368;
     $364 = $1281;
     $1282 = $364;
     $1283 = HEAP32[$1282>>2]|0;
     $1284 = $367;
     HEAP32[$1284>>2] = $1283;
     $365 = $369;
     $1285 = $365;
     $1286 = HEAP32[$1285>>2]|0;
     $1287 = $368;
     HEAP32[$1287>>2] = $1286;
     $372 = $446;
     $1288 = $372;
     $1289 = ((($1288)) + 12|0);
     $371 = $1289;
     $1290 = $371;
     $370 = $1290;
     $1291 = $370;
     $375 = $437;
     $1292 = $375;
     $1293 = ((($1292)) + 12|0);
     $374 = $1293;
     $1294 = $374;
     $373 = $1294;
     $1295 = $373;
     $379 = $1291;
     $380 = $1295;
     $1296 = $379;
     $378 = $1296;
     $1297 = $378;
     $1298 = HEAP32[$1297>>2]|0;
     HEAP32[$381>>2] = $1298;
     $1299 = $380;
     $376 = $1299;
     $1300 = $376;
     $1301 = HEAP32[$1300>>2]|0;
     $1302 = $379;
     HEAP32[$1302>>2] = $1301;
     $377 = $381;
     $1303 = $377;
     $1304 = HEAP32[$1303>>2]|0;
     $1305 = $380;
     HEAP32[$1305>>2] = $1304;
     $382 = $446;
     $1306 = $382;
     $1307 = ((($1306)) + 8|0);
     $1308 = HEAP32[$1307>>2]|0;
     $1309 = ((($1306)) + 4|0);
     $1310 = HEAP32[$1309>>2]|0;
     $1311 = $1308;
     $1312 = $1310;
     $1313 = (($1311) - ($1312))|0;
     $1314 = (($1313|0) / 4)&-1;
     $1315 = ($1314|0)==(1);
     if ($1315) {
      $1320 = 512;
     } else {
      $1316 = ((($446)) + 16|0);
      $1317 = HEAP32[$1316>>2]|0;
      $1318 = (($1317) + 1024)|0;
      $1320 = $1318;
     }
     $1319 = ((($446)) + 16|0);
     HEAP32[$1319>>2] = $1320;
     $402 = $440;
     $1321 = $402;
     $399 = $1321;
     $400 = 0;
     $1322 = $399;
     $398 = $1322;
     $1323 = $398;
     $397 = $1323;
     $1324 = $397;
     $1325 = HEAP32[$1324>>2]|0;
     $401 = $1325;
     $1326 = $400;
     $387 = $1322;
     $1327 = $387;
     $386 = $1327;
     $1328 = $386;
     HEAP32[$1328>>2] = $1326;
     $1329 = $401;
     $1330 = ($1329|0)!=(0|0);
     if ($1330) {
      $385 = $1322;
      $1331 = $385;
      $384 = $1331;
      $1332 = $384;
      $1333 = ((($1332)) + 4|0);
      $1334 = $401;
      $395 = $1333;
      $396 = $1334;
      $1335 = $395;
      $1336 = HEAP32[$1335>>2]|0;
      $1337 = $396;
      $1338 = ((($1335)) + 4|0);
      $1339 = HEAP32[$1338>>2]|0;
      $392 = $1336;
      $393 = $1337;
      $394 = $1339;
      $1340 = $392;
      $1341 = $393;
      $1342 = $394;
      $389 = $1340;
      $390 = $1341;
      $391 = $1342;
      $1343 = $390;
      $388 = $1343;
      $1344 = $388;
      __ZdlPv($1344);
     }
     __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEED2Ev($437);
     STACKTOP = sp;return;
    }
   } while(0);
   if ((label|0) == 61) {
    $1228 = ___cxa_find_matching_catch_2()|0;
    $1229 = tempRet0;
    $$index = $1228;$$index3 = $1229;
   }
   $441 = $$index;
   $442 = $$index3;
   $351 = $440;
   $1230 = $351;
   $348 = $1230;
   $349 = 0;
   $1231 = $348;
   $347 = $1231;
   $1232 = $347;
   $346 = $1232;
   $1233 = $346;
   $1234 = HEAP32[$1233>>2]|0;
   $350 = $1234;
   $1235 = $349;
   $336 = $1231;
   $1236 = $336;
   $335 = $1236;
   $1237 = $335;
   HEAP32[$1237>>2] = $1235;
   $1238 = $350;
   $1239 = ($1238|0)!=(0|0);
   if ($1239) {
    $334 = $1231;
    $1240 = $334;
    $333 = $1240;
    $1241 = $333;
    $1242 = ((($1241)) + 4|0);
    $1243 = $350;
    $344 = $1242;
    $345 = $1243;
    $1244 = $344;
    $1245 = HEAP32[$1244>>2]|0;
    $1246 = $345;
    $1247 = ((($1244)) + 4|0);
    $1248 = HEAP32[$1247>>2]|0;
    $341 = $1245;
    $342 = $1246;
    $343 = $1248;
    $1249 = $341;
    $1250 = $342;
    $1251 = $343;
    $338 = $1249;
    $339 = $1250;
    $340 = $1251;
    $1252 = $339;
    $337 = $1252;
    $1253 = $337;
    __ZdlPv($1253);
   }
  }
 }
 if ((label|0) == 60) {
  $1226 = ___cxa_find_matching_catch_2()|0;
  $1227 = tempRet0;
  $441 = $1226;
  $442 = $1227;
 }
 __THREW__ = 0;
 invoke_vi(53,($437|0));
 $1345 = __THREW__; __THREW__ = 0;
 $1346 = $1345&1;
 if ($1346) {
  $1349 = ___cxa_find_matching_catch_3(0|0)|0;
  $1350 = tempRet0;
  ___clang_call_terminate($1349);
  // unreachable;
 } else {
  $1347 = $441;
  $1348 = $442;
  ___resumeException($1347|0);
  // unreachable;
 }
}
function __ZNSt3__214__split_bufferIPiNS_9allocatorIS1_EEE10push_frontERKS1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$byval_copy = 0, $$byval_copy1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 368|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(368|0);
 $$byval_copy1 = sp + 348|0;
 $$byval_copy = sp + 344|0;
 $14 = sp;
 $17 = sp + 352|0;
 $23 = sp + 264|0;
 $29 = sp + 240|0;
 $35 = sp + 216|0;
 $47 = sp + 168|0;
 $78 = sp + 44|0;
 $79 = sp + 40|0;
 $80 = sp + 20|0;
 $81 = sp + 16|0;
 $84 = sp + 4|0;
 $74 = $0;
 $75 = $1;
 $85 = $74;
 $86 = ((($85)) + 4|0);
 $87 = HEAP32[$86>>2]|0;
 $88 = HEAP32[$85>>2]|0;
 $89 = ($87|0)==($88|0);
 if (!($89)) {
  $63 = $85;
  $246 = $63;
  $247 = ((($246)) + 12|0);
  $62 = $247;
  $248 = $62;
  $61 = $248;
  $249 = $61;
  $250 = ((($85)) + 4|0);
  $251 = HEAP32[$250>>2]|0;
  $252 = ((($251)) + -4|0);
  $64 = $252;
  $253 = $64;
  $254 = $75;
  $65 = $249;
  $66 = $253;
  $67 = $254;
  $255 = $66;
  $256 = $67;
  $257 = HEAP32[$256>>2]|0;
  HEAP32[$255>>2] = $257;
  $258 = ((($85)) + 4|0);
  $259 = HEAP32[$258>>2]|0;
  $260 = ((($259)) + -4|0);
  HEAP32[$258>>2] = $260;
  STACKTOP = sp;return;
 }
 $90 = ((($85)) + 8|0);
 $91 = HEAP32[$90>>2]|0;
 $73 = $85;
 $92 = $73;
 $93 = ((($92)) + 12|0);
 $72 = $93;
 $94 = $72;
 $71 = $94;
 $95 = $71;
 $96 = HEAP32[$95>>2]|0;
 $97 = ($91>>>0)<($96>>>0);
 if ($97) {
  $70 = $85;
  $98 = $70;
  $99 = ((($98)) + 12|0);
  $69 = $99;
  $100 = $69;
  $68 = $100;
  $101 = $68;
  $102 = HEAP32[$101>>2]|0;
  $103 = ((($85)) + 8|0);
  $104 = HEAP32[$103>>2]|0;
  $105 = $102;
  $106 = $104;
  $107 = (($105) - ($106))|0;
  $108 = (($107|0) / 4)&-1;
  $76 = $108;
  $109 = $76;
  $110 = (($109) + 1)|0;
  $111 = (($110|0) / 2)&-1;
  $76 = $111;
  $112 = ((($85)) + 4|0);
  $113 = HEAP32[$112>>2]|0;
  $114 = ((($85)) + 8|0);
  $115 = HEAP32[$114>>2]|0;
  $116 = ((($85)) + 8|0);
  $117 = HEAP32[$116>>2]|0;
  $118 = $76;
  $119 = (($117) + ($118<<2)|0);
  $58 = $113;
  $59 = $115;
  $60 = $119;
  $120 = $58;
  $57 = $120;
  $121 = $57;
  $122 = $59;
  $51 = $122;
  $123 = $51;
  $124 = $60;
  $52 = $124;
  $125 = $52;
  $53 = $121;
  $54 = $123;
  $55 = $125;
  $126 = $54;
  $127 = $53;
  $128 = $126;
  $129 = $127;
  $130 = (($128) - ($129))|0;
  $131 = (($130|0) / 4)&-1;
  $56 = $131;
  $132 = $56;
  $133 = ($132>>>0)>(0);
  if ($133) {
   $134 = $56;
   $135 = $55;
   $136 = (0 - ($134))|0;
   $137 = (($135) + ($136<<2)|0);
   $55 = $137;
   $138 = $55;
   $139 = $53;
   $140 = $56;
   $141 = $140<<2;
   _memmove(($138|0),($139|0),($141|0))|0;
  }
  $142 = $55;
  $143 = ((($85)) + 4|0);
  HEAP32[$143>>2] = $142;
  $144 = $76;
  $145 = ((($85)) + 8|0);
  $146 = HEAP32[$145>>2]|0;
  $147 = (($146) + ($144<<2)|0);
  HEAP32[$145>>2] = $147;
  $63 = $85;
  $246 = $63;
  $247 = ((($246)) + 12|0);
  $62 = $247;
  $248 = $62;
  $61 = $248;
  $249 = $61;
  $250 = ((($85)) + 4|0);
  $251 = HEAP32[$250>>2]|0;
  $252 = ((($251)) + -4|0);
  $64 = $252;
  $253 = $64;
  $254 = $75;
  $65 = $249;
  $66 = $253;
  $67 = $254;
  $255 = $66;
  $256 = $67;
  $257 = HEAP32[$256>>2]|0;
  HEAP32[$255>>2] = $257;
  $258 = ((($85)) + 4|0);
  $259 = HEAP32[$258>>2]|0;
  $260 = ((($259)) + -4|0);
  HEAP32[$258>>2] = $260;
  STACKTOP = sp;return;
 }
 $50 = $85;
 $148 = $50;
 $149 = ((($148)) + 12|0);
 $49 = $149;
 $150 = $49;
 $48 = $150;
 $151 = $48;
 $152 = HEAP32[$151>>2]|0;
 $153 = HEAP32[$85>>2]|0;
 $154 = $152;
 $155 = $153;
 $156 = (($154) - ($155))|0;
 $157 = (($156|0) / 4)&-1;
 $158 = $157<<1;
 HEAP32[$78>>2] = $158;
 HEAP32[$79>>2] = 1;
 $15 = $78;
 $16 = $79;
 $159 = $15;
 $160 = $16;
 ;HEAP8[$14>>0]=HEAP8[$17>>0]|0;
 $12 = $159;
 $13 = $160;
 $161 = $12;
 $162 = $13;
 $9 = $14;
 $10 = $161;
 $11 = $162;
 $163 = $10;
 $164 = HEAP32[$163>>2]|0;
 $165 = $11;
 $166 = HEAP32[$165>>2]|0;
 $167 = ($164>>>0)<($166>>>0);
 $168 = $13;
 $169 = $12;
 $170 = $167 ? $168 : $169;
 $171 = HEAP32[$170>>2]|0;
 $77 = $171;
 $172 = $77;
 $173 = $77;
 $174 = (($173) + 3)|0;
 $175 = (($174>>>0) / 4)&-1;
 $4 = $85;
 $176 = $4;
 $177 = ((($176)) + 12|0);
 $3 = $177;
 $178 = $3;
 $2 = $178;
 $179 = $2;
 __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEEC2EjjS4_($80,$172,$175,$179);
 $180 = ((($85)) + 4|0);
 $181 = HEAP32[$180>>2]|0;
 $5 = $81;
 $6 = $181;
 $182 = $5;
 $183 = $6;
 HEAP32[$182>>2] = $183;
 $184 = ((($85)) + 8|0);
 $185 = HEAP32[$184>>2]|0;
 $7 = $84;
 $8 = $185;
 $186 = $7;
 $187 = $8;
 HEAP32[$186>>2] = $187;
 __THREW__ = 0;
 ;HEAP32[$$byval_copy>>2]=HEAP32[$81>>2]|0;
 ;HEAP32[$$byval_copy1>>2]=HEAP32[$84>>2]|0;
 invoke_viii(52,($80|0),($$byval_copy|0),($$byval_copy1|0));
 $188 = __THREW__; __THREW__ = 0;
 $189 = $188&1;
 if (!($189)) {
  $21 = $85;
  $22 = $80;
  $190 = $21;
  $20 = $190;
  $191 = $20;
  $192 = HEAP32[$191>>2]|0;
  HEAP32[$23>>2] = $192;
  $193 = $22;
  $18 = $193;
  $194 = $18;
  $195 = HEAP32[$194>>2]|0;
  $196 = $21;
  HEAP32[$196>>2] = $195;
  $19 = $23;
  $197 = $19;
  $198 = HEAP32[$197>>2]|0;
  $199 = $22;
  HEAP32[$199>>2] = $198;
  $200 = ((($85)) + 4|0);
  $201 = ((($80)) + 4|0);
  $27 = $200;
  $28 = $201;
  $202 = $27;
  $26 = $202;
  $203 = $26;
  $204 = HEAP32[$203>>2]|0;
  HEAP32[$29>>2] = $204;
  $205 = $28;
  $24 = $205;
  $206 = $24;
  $207 = HEAP32[$206>>2]|0;
  $208 = $27;
  HEAP32[$208>>2] = $207;
  $25 = $29;
  $209 = $25;
  $210 = HEAP32[$209>>2]|0;
  $211 = $28;
  HEAP32[$211>>2] = $210;
  $212 = ((($85)) + 8|0);
  $213 = ((($80)) + 8|0);
  $33 = $212;
  $34 = $213;
  $214 = $33;
  $32 = $214;
  $215 = $32;
  $216 = HEAP32[$215>>2]|0;
  HEAP32[$35>>2] = $216;
  $217 = $34;
  $30 = $217;
  $218 = $30;
  $219 = HEAP32[$218>>2]|0;
  $220 = $33;
  HEAP32[$220>>2] = $219;
  $31 = $35;
  $221 = $31;
  $222 = HEAP32[$221>>2]|0;
  $223 = $34;
  HEAP32[$223>>2] = $222;
  $38 = $85;
  $224 = $38;
  $225 = ((($224)) + 12|0);
  $37 = $225;
  $226 = $37;
  $36 = $226;
  $227 = $36;
  $41 = $80;
  $228 = $41;
  $229 = ((($228)) + 12|0);
  $40 = $229;
  $230 = $40;
  $39 = $230;
  $231 = $39;
  $45 = $227;
  $46 = $231;
  $232 = $45;
  $44 = $232;
  $233 = $44;
  $234 = HEAP32[$233>>2]|0;
  HEAP32[$47>>2] = $234;
  $235 = $46;
  $42 = $235;
  $236 = $42;
  $237 = HEAP32[$236>>2]|0;
  $238 = $45;
  HEAP32[$238>>2] = $237;
  $43 = $47;
  $239 = $43;
  $240 = HEAP32[$239>>2]|0;
  $241 = $46;
  HEAP32[$241>>2] = $240;
  __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEED2Ev($80);
  $63 = $85;
  $246 = $63;
  $247 = ((($246)) + 12|0);
  $62 = $247;
  $248 = $62;
  $61 = $248;
  $249 = $61;
  $250 = ((($85)) + 4|0);
  $251 = HEAP32[$250>>2]|0;
  $252 = ((($251)) + -4|0);
  $64 = $252;
  $253 = $64;
  $254 = $75;
  $65 = $249;
  $66 = $253;
  $67 = $254;
  $255 = $66;
  $256 = $67;
  $257 = HEAP32[$256>>2]|0;
  HEAP32[$255>>2] = $257;
  $258 = ((($85)) + 4|0);
  $259 = HEAP32[$258>>2]|0;
  $260 = ((($259)) + -4|0);
  HEAP32[$258>>2] = $260;
  STACKTOP = sp;return;
 }
 $242 = ___cxa_find_matching_catch_2()|0;
 $243 = tempRet0;
 $82 = $242;
 $83 = $243;
 __THREW__ = 0;
 invoke_vi(53,($80|0));
 $244 = __THREW__; __THREW__ = 0;
 $245 = $244&1;
 if ($245) {
  $263 = ___cxa_find_matching_catch_3(0|0)|0;
  $264 = tempRet0;
  ___clang_call_terminate($263);
  // unreachable;
 } else {
  $261 = $82;
  $262 = $83;
  ___resumeException($261|0);
  // unreachable;
 }
}
function __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEEC2EjjS4_($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 160|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(160|0);
 $11 = sp + 116|0;
 $15 = sp + 100|0;
 $27 = sp + 52|0;
 $34 = sp + 24|0;
 $39 = sp + 4|0;
 $40 = sp;
 $35 = $0;
 $36 = $1;
 $37 = $2;
 $38 = $3;
 $41 = $35;
 $42 = ((($41)) + 12|0);
 $32 = $34;
 $33 = -1;
 $43 = $32;
 HEAP32[$43>>2] = 0;
 $44 = HEAP32[$34>>2]|0;
 HEAP32[$39>>2] = $44;
 $17 = $39;
 $45 = $38;
 $14 = $42;
 HEAP32[$15>>2] = 0;
 $16 = $45;
 $46 = $14;
 $13 = $15;
 $47 = $13;
 $48 = HEAP32[$47>>2]|0;
 $49 = $16;
 $7 = $49;
 $50 = $7;
 $10 = $46;
 HEAP32[$11>>2] = $48;
 $12 = $50;
 $51 = $10;
 $9 = $11;
 $52 = $9;
 $53 = HEAP32[$52>>2]|0;
 HEAP32[$51>>2] = $53;
 $54 = ((($51)) + 4|0);
 $55 = $12;
 $8 = $55;
 $56 = $8;
 HEAP32[$54>>2] = $56;
 $57 = $36;
 $58 = ($57|0)!=(0);
 do {
  if ($58) {
   $6 = $41;
   $59 = $6;
   $60 = ((($59)) + 12|0);
   $5 = $60;
   $61 = $5;
   $4 = $61;
   $62 = $4;
   $63 = ((($62)) + 4|0);
   $64 = HEAP32[$63>>2]|0;
   $65 = $36;
   $23 = $64;
   $24 = $65;
   $66 = $23;
   $67 = $24;
   $20 = $66;
   $21 = $67;
   $22 = 0;
   $68 = $20;
   $69 = $21;
   $19 = $68;
   $70 = ($69>>>0)>(1073741823);
   if ($70) {
    $71 = (___cxa_allocate_exception(4)|0);
    __ZNSt9bad_allocC2Ev($71);
    ___cxa_throw(($71|0),(72|0),(19|0));
    // unreachable;
   } else {
    $72 = $21;
    $73 = $72<<2;
    $18 = $73;
    $74 = $18;
    $75 = (__Znwj($74)|0);
    $78 = $75;
    break;
   }
  } else {
   $25 = $27;
   $26 = -1;
   $76 = $25;
   HEAP32[$76>>2] = 0;
   $77 = HEAP32[$27>>2]|0;
   HEAP32[$40>>2] = $77;
   $28 = $40;
   $78 = 0;
  }
 } while(0);
 HEAP32[$41>>2] = $78;
 $79 = HEAP32[$41>>2]|0;
 $80 = $37;
 $81 = (($79) + ($80<<2)|0);
 $82 = ((($41)) + 8|0);
 HEAP32[$82>>2] = $81;
 $83 = ((($41)) + 4|0);
 HEAP32[$83>>2] = $81;
 $84 = HEAP32[$41>>2]|0;
 $85 = $36;
 $86 = (($84) + ($85<<2)|0);
 $31 = $41;
 $87 = $31;
 $88 = ((($87)) + 12|0);
 $30 = $88;
 $89 = $30;
 $29 = $89;
 $90 = $29;
 HEAP32[$90>>2] = $86;
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $18 = sp + 8|0;
 $21 = sp + 125|0;
 $27 = sp;
 $30 = sp + 124|0;
 $32 = $0;
 $33 = $32;
 $31 = $33;
 $34 = $31;
 $35 = ((($34)) + 4|0);
 $36 = HEAP32[$35>>2]|0;
 $28 = $34;
 $29 = $36;
 $37 = $28;
 $38 = $29;
 ;HEAP8[$27>>0]=HEAP8[$30>>0]|0;
 $25 = $37;
 $26 = $38;
 $39 = $25;
 while(1) {
  $40 = $26;
  $41 = ((($39)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = ($40|0)!=($42|0);
  if (!($43)) {
   break;
  }
  $24 = $39;
  $44 = $24;
  $45 = ((($44)) + 12|0);
  $23 = $45;
  $46 = $23;
  $22 = $46;
  $47 = $22;
  $48 = ((($47)) + 4|0);
  $49 = HEAP32[$48>>2]|0;
  $50 = ((($39)) + 8|0);
  $51 = HEAP32[$50>>2]|0;
  $52 = ((($51)) + -4|0);
  HEAP32[$50>>2] = $52;
  $15 = $52;
  $53 = $15;
  $19 = $49;
  $20 = $53;
  $54 = $19;
  $55 = $20;
  ;HEAP8[$18>>0]=HEAP8[$21>>0]|0;
  $16 = $54;
  $17 = $55;
 }
 $56 = HEAP32[$33>>2]|0;
 $57 = ($56|0)!=(0|0);
 if (!($57)) {
  STACKTOP = sp;return;
 }
 $7 = $33;
 $58 = $7;
 $59 = ((($58)) + 12|0);
 $6 = $59;
 $60 = $6;
 $5 = $60;
 $61 = $5;
 $62 = ((($61)) + 4|0);
 $63 = HEAP32[$62>>2]|0;
 $64 = HEAP32[$33>>2]|0;
 $4 = $33;
 $65 = $4;
 $3 = $65;
 $66 = $3;
 $67 = ((($66)) + 12|0);
 $2 = $67;
 $68 = $2;
 $1 = $68;
 $69 = $1;
 $70 = HEAP32[$69>>2]|0;
 $71 = HEAP32[$65>>2]|0;
 $72 = $70;
 $73 = $71;
 $74 = (($72) - ($73))|0;
 $75 = (($74|0) / 4)&-1;
 $12 = $63;
 $13 = $64;
 $14 = $75;
 $76 = $12;
 $77 = $13;
 $78 = $14;
 $9 = $76;
 $10 = $77;
 $11 = $78;
 $79 = $10;
 $8 = $79;
 $80 = $8;
 __ZdlPv($80);
 STACKTOP = sp;return;
}
function __ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEE18__construct_at_endINS_13move_iteratorIPS1_EEEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeESB_SB_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $16 = $0;
 $18 = $16;
 $15 = $18;
 $19 = $15;
 $20 = ((($19)) + 12|0);
 $14 = $20;
 $21 = $14;
 $13 = $21;
 $22 = $13;
 $23 = ((($22)) + 4|0);
 $24 = HEAP32[$23>>2]|0;
 $17 = $24;
 while(1) {
  $5 = $1;
  $6 = $2;
  $25 = $5;
  $4 = $25;
  $26 = $4;
  $27 = HEAP32[$26>>2]|0;
  $28 = $6;
  $3 = $28;
  $29 = $3;
  $30 = HEAP32[$29>>2]|0;
  $31 = ($27|0)!=($30|0);
  if (!($31)) {
   break;
  }
  $32 = $17;
  $33 = ((($18)) + 8|0);
  $34 = HEAP32[$33>>2]|0;
  $7 = $34;
  $35 = $7;
  $8 = $1;
  $36 = $8;
  $37 = HEAP32[$36>>2]|0;
  $9 = $32;
  $10 = $35;
  $11 = $37;
  $38 = $10;
  $39 = $11;
  $40 = HEAP32[$39>>2]|0;
  HEAP32[$38>>2] = $40;
  $41 = ((($18)) + 8|0);
  $42 = HEAP32[$41>>2]|0;
  $43 = ((($42)) + 4|0);
  HEAP32[$41>>2] = $43;
  $12 = $1;
  $44 = $12;
  $45 = HEAP32[$44>>2]|0;
  $46 = ((($45)) + 4|0);
  HEAP32[$44>>2] = $46;
 }
 STACKTOP = sp;return;
}
function __ZL13__DOUBLE_BITSd($0) {
 $0 = +$0;
 var $1 = 0.0, $2 = 0, $3 = 0.0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $1 = $0;
 $3 = $1;
 HEAPF64[$2>>3] = $3;
 $4 = $2;
 $5 = $4;
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) + 4)|0;
 $8 = $7;
 $9 = HEAP32[$8>>2]|0;
 tempRet0 = ($9);
 STACKTOP = sp;return ($6|0);
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 HEAP32[$vararg_buffer>>2] = $2;
 $3 = (___syscall6(6,($vararg_buffer|0))|0);
 $4 = (___syscall_ret($3)|0);
 STACKTOP = sp;return ($4|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $3;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $6 = (___syscall140(140,($vararg_buffer|0))|0);
 $7 = (___syscall_ret($6)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  HEAP32[$3>>2] = -1;
  $9 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $9 = $$pre;
 }
 STACKTOP = sp;return ($9|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[2471]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$0 = 9928;
 } else {
  $2 = (_pthread_self()|0);
  $3 = ((($2)) + 64|0);
  $4 = HEAP32[$3>>2]|0;
  $$0 = $4;
 }
 return ($$0|0);
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(80|0);
 $vararg_buffer = sp;
 $3 = sp + 12|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 4;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21505;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $3;
  $10 = (___syscall54(54,($vararg_buffer|0))|0);
  $11 = ($10|0)==(0);
  if (!($11)) {
   $12 = ((($0)) + 75|0);
   HEAP8[$12>>0] = -1;
  }
 }
 $13 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($13|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$056 = 0, $$058 = 0, $$059 = 0, $$061 = 0, $$1 = 0, $$157 = 0, $$160 = 0, $$phi$trans$insert = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0;
 var $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = ((($0)) + 44|0);
 $$056 = 2;$$058 = $12;$$059 = $3;
 while(1) {
  $15 = HEAP32[2471]|0;
  $16 = ($15|0)==(0|0);
  if ($16) {
   $20 = HEAP32[$13>>2]|0;
   HEAP32[$vararg_buffer3>>2] = $20;
   $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
   HEAP32[$vararg_ptr6>>2] = $$059;
   $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
   HEAP32[$vararg_ptr7>>2] = $$056;
   $21 = (___syscall146(146,($vararg_buffer3|0))|0);
   $22 = (___syscall_ret($21)|0);
   $$0 = $22;
  } else {
   _pthread_cleanup_push((55|0),($0|0));
   $17 = HEAP32[$13>>2]|0;
   HEAP32[$vararg_buffer>>2] = $17;
   $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = $$059;
   $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = $$056;
   $18 = (___syscall146(146,($vararg_buffer|0))|0);
   $19 = (___syscall_ret($18)|0);
   _pthread_cleanup_pop(0);
   $$0 = $19;
  }
  $23 = ($$058|0)==($$0|0);
  if ($23) {
   label = 6;
   break;
  }
  $30 = ($$0|0)<(0);
  if ($30) {
   label = 8;
   break;
  }
  $38 = (($$058) - ($$0))|0;
  $39 = ((($$059)) + 4|0);
  $40 = HEAP32[$39>>2]|0;
  $41 = ($$0>>>0)>($40>>>0);
  if ($41) {
   $42 = HEAP32[$14>>2]|0;
   HEAP32[$4>>2] = $42;
   HEAP32[$7>>2] = $42;
   $43 = (($$0) - ($40))|0;
   $44 = ((($$059)) + 8|0);
   $45 = (($$056) + -1)|0;
   $$phi$trans$insert = ((($$059)) + 12|0);
   $$pre = HEAP32[$$phi$trans$insert>>2]|0;
   $$1 = $43;$$157 = $45;$$160 = $44;$53 = $$pre;
  } else {
   $46 = ($$056|0)==(2);
   if ($46) {
    $47 = HEAP32[$4>>2]|0;
    $48 = (($47) + ($$0)|0);
    HEAP32[$4>>2] = $48;
    $$1 = $$0;$$157 = 2;$$160 = $$059;$53 = $40;
   } else {
    $$1 = $$0;$$157 = $$056;$$160 = $$059;$53 = $40;
   }
  }
  $49 = HEAP32[$$160>>2]|0;
  $50 = (($49) + ($$1)|0);
  HEAP32[$$160>>2] = $50;
  $51 = ((($$160)) + 4|0);
  $52 = (($53) - ($$1))|0;
  HEAP32[$51>>2] = $52;
  $$056 = $$157;$$058 = $38;$$059 = $$160;
 }
 if ((label|0) == 6) {
  $24 = HEAP32[$14>>2]|0;
  $25 = ((($0)) + 48|0);
  $26 = HEAP32[$25>>2]|0;
  $27 = (($24) + ($26)|0);
  $28 = ((($0)) + 16|0);
  HEAP32[$28>>2] = $27;
  $29 = $24;
  HEAP32[$4>>2] = $29;
  HEAP32[$7>>2] = $29;
  $$061 = $2;
 }
 else if ((label|0) == 8) {
  $31 = ((($0)) + 16|0);
  HEAP32[$31>>2] = 0;
  HEAP32[$4>>2] = 0;
  HEAP32[$7>>2] = 0;
  $32 = HEAP32[$0>>2]|0;
  $33 = $32 | 32;
  HEAP32[$0>>2] = $33;
  $34 = ($$056|0)==(2);
  if ($34) {
   $$061 = 0;
  } else {
   $35 = ((($$059)) + 4|0);
   $36 = HEAP32[$35>>2]|0;
   $37 = (($2) - ($36))|0;
   $$061 = $37;
  }
 }
 STACKTOP = sp;return ($$061|0);
}
function _cleanup_207($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 68|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)==(0);
 if ($3) {
  ___unlockfile($0);
 }
 return;
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$014 = 0, $$015$lcssa = 0, $$01518 = 0, $$1$lcssa = 0, $$pn = 0, $$pn29 = 0, $$pre = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0;
 var $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 4;
  } else {
   $$01518 = $0;$22 = $1;
   while(1) {
    $4 = HEAP8[$$01518>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$pn = $22;
     break L1;
    }
    $6 = ((($$01518)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 4;
     break;
    } else {
     $$01518 = $6;$22 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn29 = $$0;
   while(1) {
    $19 = ((($$pn29)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn29 = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$pn = $21;
 }
 $$014 = (($$pn) - ($1))|0;
 return ($$014|0);
}
function _snprintf($0,$1,$2,$varargs) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $varargs = $varargs|0;
 var $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 HEAP32[$3>>2] = $varargs;
 $4 = (_vsnprintf($0,$1,$2,$3)|0);
 STACKTOP = sp;return ($4|0);
}
function _vsnprintf($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$$015 = 0, $$0 = 0, $$014 = 0, $$015 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, dest = 0, label = 0, sp = 0, src = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 128|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(128|0);
 $4 = sp + 112|0;
 $5 = sp;
 dest=$5; src=384; stop=dest+112|0; do { HEAP32[dest>>2]=HEAP32[src>>2]|0; dest=dest+4|0; src=src+4|0; } while ((dest|0) < (stop|0));
 $6 = (($1) + -1)|0;
 $7 = ($6>>>0)>(2147483646);
 if ($7) {
  $8 = ($1|0)==(0);
  if ($8) {
   $$014 = $4;$$015 = 1;
   label = 4;
  } else {
   $9 = (___errno_location()|0);
   HEAP32[$9>>2] = 75;
   $$0 = -1;
  }
 } else {
  $$014 = $0;$$015 = $1;
  label = 4;
 }
 if ((label|0) == 4) {
  $10 = $$014;
  $11 = (-2 - ($10))|0;
  $12 = ($$015>>>0)>($11>>>0);
  $$$015 = $12 ? $11 : $$015;
  $13 = ((($5)) + 48|0);
  HEAP32[$13>>2] = $$$015;
  $14 = ((($5)) + 20|0);
  HEAP32[$14>>2] = $$014;
  $15 = ((($5)) + 44|0);
  HEAP32[$15>>2] = $$014;
  $16 = (($$014) + ($$$015)|0);
  $17 = ((($5)) + 16|0);
  HEAP32[$17>>2] = $16;
  $18 = ((($5)) + 28|0);
  HEAP32[$18>>2] = $16;
  $19 = (_vfprintf($5,$2,$3)|0);
  $20 = ($$$015|0)==(0);
  if ($20) {
   $$0 = $19;
  } else {
   $21 = HEAP32[$14>>2]|0;
   $22 = HEAP32[$17>>2]|0;
   $23 = ($21|0)==($22|0);
   $24 = $23 << 31 >> 31;
   $25 = (($21) + ($24)|0);
   HEAP8[$25>>0] = 0;
   $$0 = $19;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $39 = $12;
  } else {
   $39 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 63]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $$ = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $$;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $$1$ = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $40 = ($39|0)==(0);
  if (!($40)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$0259 = 0, $$$0262 = 0, $$$0269 = 0, $$$3484$i = 0, $$$3484705$i = 0, $$$3484706$i = 0, $$$3501$i = 0, $$$4266 = 0, $$$4502$i = 0, $$$5 = 0, $$$i = 0, $$0 = 0, $$0$i = 0, $$0$lcssa$i300 = 0, $$0228 = 0, $$0229396 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0;
 var $$0240$lcssa = 0, $$0240$lcssa460 = 0, $$0240395 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0, $$0249383 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$ = 0, $$0259 = 0, $$0262342 = 0, $$0262390 = 0, $$0269 = 0, $$0269$phi = 0, $$0321 = 0, $$0463$lcssa$i = 0, $$0463594$i = 0, $$0464603$i = 0;
 var $$0466$i = 0.0, $$0470$i = 0, $$0471$i = 0.0, $$0479$i = 0, $$0487652$i = 0, $$0488$i = 0, $$0488663$i = 0, $$0488665$i = 0, $$0496$$9$i = 0, $$0497664$i = 0, $$0498$i = 0, $$05$lcssa$i = 0, $$0509592$i = 0.0, $$0510$i = 0, $$0511$i = 0, $$0514647$i = 0, $$0520$i = 0, $$0522$$i = 0, $$0522$i = 0, $$0524$i = 0;
 var $$0526$i = 0, $$0528$i = 0, $$0528639$i = 0, $$0528641$i = 0, $$0531646$i = 0, $$056$i = 0, $$06$i = 0, $$06$i290 = 0, $$06$i298 = 0, $$1 = 0, $$1230407 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241406 = 0, $$1244394 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0, $$1260 = 0;
 var $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$1322 = 0, $$1465$i = 0, $$1467$i = 0.0, $$1469$i = 0.0, $$1472$i = 0.0, $$1480$i = 0, $$1482$lcssa$i = 0, $$1482671$i = 0, $$1489651$i = 0, $$1499$lcssa$i = 0, $$1499670$i = 0, $$1508593$i = 0, $$1512$lcssa$i = 0, $$1512617$i = 0, $$1515$i = 0, $$1521$i = 0, $$1525$i = 0;
 var $$1527$i = 0, $$1529624$i = 0, $$1532$lcssa$i = 0, $$1532640$i = 0, $$1607$i = 0, $$2 = 0, $$2$i = 0, $$2234 = 0, $$2239 = 0, $$2242381 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2261 = 0, $$2271 = 0, $$2323$lcssa = 0, $$2323382 = 0, $$2473$i = 0.0, $$2476$$545$i = 0;
 var $$2476$$547$i = 0, $$2476$i = 0, $$2483$ph$i = 0, $$2490$lcssa$i = 0, $$2490632$i = 0, $$2500$i = 0, $$2513$i = 0, $$2516628$i = 0, $$2530$i = 0, $$2533627$i = 0, $$3$i = 0.0, $$3257 = 0, $$3265 = 0, $$3272 = 0, $$331 = 0, $$332 = 0, $$333 = 0, $$3379 = 0, $$3477$i = 0, $$3484$lcssa$i = 0;
 var $$3484658$i = 0, $$3501$lcssa$i = 0, $$3501657$i = 0, $$3534623$i = 0, $$4$i = 0.0, $$4258458 = 0, $$4266 = 0, $$4325 = 0, $$4478$lcssa$i = 0, $$4478600$i = 0, $$4492$i = 0, $$4502$i = 0, $$4518$i = 0, $$5 = 0, $$5$lcssa$i = 0, $$537$i = 0, $$538$$i = 0, $$538$i = 0, $$541$i = 0.0, $$544$i = 0;
 var $$546$i = 0, $$5486$lcssa$i = 0, $$5486633$i = 0, $$5493606$i = 0, $$5519$ph$i = 0, $$553$i = 0, $$554$i = 0, $$557$i = 0.0, $$5611$i = 0, $$6 = 0, $$6$i = 0, $$6268 = 0, $$6494599$i = 0, $$7 = 0, $$7495610$i = 0, $$7505$$i = 0, $$7505$i = 0, $$7505$ph$i = 0, $$8$i = 0, $$9$ph$i = 0;
 var $$lcssa683$i = 0, $$neg$i = 0, $$neg572$i = 0, $$pn$i = 0, $$pr = 0, $$pr$i = 0, $$pr571$i = 0, $$pre = 0, $$pre$i = 0, $$pre$phi704$iZ2D = 0, $$pre452 = 0, $$pre453 = 0, $$pre454 = 0, $$pre697$i = 0, $$pre700$i = 0, $$pre703$i = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0;
 var $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0;
 var $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0;
 var $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0;
 var $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0;
 var $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0;
 var $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0.0, $372 = 0, $373 = 0, $374 = 0, $375 = 0.0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0;
 var $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0.0, $404 = 0.0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0;
 var $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0.0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0.0, $424 = 0.0, $425 = 0.0, $426 = 0.0, $427 = 0.0, $428 = 0.0, $429 = 0, $43 = 0;
 var $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0;
 var $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0.0, $455 = 0.0, $456 = 0.0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0;
 var $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0;
 var $485 = 0, $486 = 0, $487 = 0.0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0.0, $494 = 0.0, $495 = 0.0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0;
 var $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0;
 var $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0;
 var $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0;
 var $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0;
 var $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0;
 var $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0.0, $606 = 0.0, $607 = 0, $608 = 0.0, $609 = 0, $61 = 0;
 var $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0;
 var $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0;
 var $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0;
 var $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0;
 var $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0;
 var $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0;
 var $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0;
 var $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0;
 var $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0;
 var $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0;
 var $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0;
 var $809 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $exitcond$i = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $isdigit = 0, $isdigit$i = 0, $isdigit$i292 = 0, $isdigit275 = 0;
 var $isdigit277 = 0, $isdigit5$i = 0, $isdigit5$i288 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp$i = 0, $isdigittmp$i291 = 0, $isdigittmp274 = 0, $isdigittmp276 = 0, $isdigittmp4$i = 0, $isdigittmp4$i287 = 0, $isdigittmp7$i = 0, $isdigittmp7$i289 = 0, $notlhs$i = 0, $notrhs$i = 0, $or$cond = 0, $or$cond$i = 0, $or$cond280 = 0, $or$cond282 = 0, $or$cond285 = 0;
 var $or$cond3$not$i = 0, $or$cond412 = 0, $or$cond540$i = 0, $or$cond543$i = 0, $or$cond552$i = 0, $or$cond6$i = 0, $scevgep694$i = 0, $scevgep694695$i = 0, $storemerge = 0, $storemerge273345 = 0, $storemerge273389 = 0, $storemerge278 = 0, $sum = 0, $trunc = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 624|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(624|0);
 $5 = sp + 24|0;
 $6 = sp + 16|0;
 $7 = sp + 588|0;
 $8 = sp + 576|0;
 $9 = sp;
 $10 = sp + 536|0;
 $11 = sp + 8|0;
 $12 = sp + 528|0;
 $13 = ($0|0)!=(0|0);
 $14 = ((($10)) + 40|0);
 $15 = $14;
 $16 = ((($10)) + 39|0);
 $17 = ((($11)) + 4|0);
 $18 = $7;
 $19 = (0 - ($18))|0;
 $20 = ((($8)) + 12|0);
 $21 = ((($8)) + 11|0);
 $22 = $20;
 $23 = (($22) - ($18))|0;
 $24 = (-2 - ($18))|0;
 $25 = (($22) + 2)|0;
 $26 = ((($5)) + 288|0);
 $27 = ((($7)) + 9|0);
 $28 = $27;
 $29 = ((($7)) + 8|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;$$0321 = $1;
 L1: while(1) {
  $30 = ($$0247|0)>(-1);
  do {
   if ($30) {
    $31 = (2147483647 - ($$0247))|0;
    $32 = ($$0243|0)>($31|0);
    if ($32) {
     $33 = (___errno_location()|0);
     HEAP32[$33>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $34 = (($$0243) + ($$0247))|0;
     $$1248 = $34;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $35 = HEAP8[$$0321>>0]|0;
  $36 = ($35<<24>>24)==(0);
  if ($36) {
   label = 243;
   break;
  } else {
   $$1322 = $$0321;$37 = $35;
  }
  L9: while(1) {
   switch ($37<<24>>24) {
   case 37:  {
    $$0249383 = $$1322;$$2323382 = $$1322;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $$1322;$$2323$lcssa = $$1322;
    break L9;
    break;
   }
   default: {
   }
   }
   $38 = ((($$1322)) + 1|0);
   $$pre = HEAP8[$38>>0]|0;
   $$1322 = $38;$37 = $$pre;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $39 = ((($$2323382)) + 1|0);
     $40 = HEAP8[$39>>0]|0;
     $41 = ($40<<24>>24)==(37);
     if (!($41)) {
      $$0249$lcssa = $$0249383;$$2323$lcssa = $$2323382;
      break L12;
     }
     $42 = ((($$0249383)) + 1|0);
     $43 = ((($$2323382)) + 2|0);
     $44 = HEAP8[$43>>0]|0;
     $45 = ($44<<24>>24)==(37);
     if ($45) {
      $$0249383 = $42;$$2323382 = $43;
      label = 9;
     } else {
      $$0249$lcssa = $42;$$2323$lcssa = $43;
      break;
     }
    }
   }
  } while(0);
  $46 = $$0249$lcssa;
  $47 = $$0321;
  $48 = (($46) - ($47))|0;
  if ($13) {
   $49 = HEAP32[$0>>2]|0;
   $50 = $49 & 32;
   $51 = ($50|0)==(0);
   if ($51) {
    (___fwritex($$0321,$48,$0)|0);
   }
  }
  $52 = ($48|0)==(0);
  if (!($52)) {
   $$0269$phi = $$0269;$$0243 = $48;$$0247 = $$1248;$$0321 = $$2323$lcssa;$$0269 = $$0269$phi;
   continue;
  }
  $53 = ((($$2323$lcssa)) + 1|0);
  $54 = HEAP8[$53>>0]|0;
  $55 = $54 << 24 >> 24;
  $isdigittmp = (($55) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $56 = ((($$2323$lcssa)) + 2|0);
   $57 = HEAP8[$56>>0]|0;
   $58 = ($57<<24>>24)==(36);
   $59 = ((($$2323$lcssa)) + 3|0);
   $$331 = $58 ? $59 : $53;
   $$$0269 = $58 ? 1 : $$0269;
   $isdigittmp$ = $58 ? $isdigittmp : -1;
   $$pre452 = HEAP8[$$331>>0]|0;
   $$0253 = $isdigittmp$;$$1270 = $$$0269;$61 = $$pre452;$storemerge = $$331;
  } else {
   $$0253 = -1;$$1270 = $$0269;$61 = $54;$storemerge = $53;
  }
  $60 = $61 << 24 >> 24;
  $62 = (($60) + -32)|0;
  $63 = ($62>>>0)<(32);
  L25: do {
   if ($63) {
    $$0262390 = 0;$65 = $62;$69 = $61;$storemerge273389 = $storemerge;
    while(1) {
     $64 = 1 << $65;
     $66 = $64 & 75913;
     $67 = ($66|0)==(0);
     if ($67) {
      $$0262342 = $$0262390;$78 = $69;$storemerge273345 = $storemerge273389;
      break L25;
     }
     $68 = $69 << 24 >> 24;
     $70 = (($68) + -32)|0;
     $71 = 1 << $70;
     $72 = $71 | $$0262390;
     $73 = ((($storemerge273389)) + 1|0);
     $74 = HEAP8[$73>>0]|0;
     $75 = $74 << 24 >> 24;
     $76 = (($75) + -32)|0;
     $77 = ($76>>>0)<(32);
     if ($77) {
      $$0262390 = $72;$65 = $76;$69 = $74;$storemerge273389 = $73;
     } else {
      $$0262342 = $72;$78 = $74;$storemerge273345 = $73;
      break;
     }
    }
   } else {
    $$0262342 = 0;$78 = $61;$storemerge273345 = $storemerge;
   }
  } while(0);
  $79 = ($78<<24>>24)==(42);
  do {
   if ($79) {
    $80 = ((($storemerge273345)) + 1|0);
    $81 = HEAP8[$80>>0]|0;
    $82 = $81 << 24 >> 24;
    $isdigittmp276 = (($82) + -48)|0;
    $isdigit277 = ($isdigittmp276>>>0)<(10);
    if ($isdigit277) {
     $83 = ((($storemerge273345)) + 2|0);
     $84 = HEAP8[$83>>0]|0;
     $85 = ($84<<24>>24)==(36);
     if ($85) {
      $86 = (($4) + ($isdigittmp276<<2)|0);
      HEAP32[$86>>2] = 10;
      $87 = HEAP8[$80>>0]|0;
      $88 = $87 << 24 >> 24;
      $89 = (($88) + -48)|0;
      $90 = (($3) + ($89<<3)|0);
      $91 = $90;
      $92 = $91;
      $93 = HEAP32[$92>>2]|0;
      $94 = (($91) + 4)|0;
      $95 = $94;
      $96 = HEAP32[$95>>2]|0;
      $97 = ((($storemerge273345)) + 3|0);
      $$0259 = $93;$$2271 = 1;$storemerge278 = $97;
     } else {
      label = 24;
     }
    } else {
     label = 24;
    }
    if ((label|0) == 24) {
     label = 0;
     $98 = ($$1270|0)==(0);
     if (!($98)) {
      $$0 = -1;
      break L1;
     }
     if (!($13)) {
      $$1260 = 0;$$1263 = $$0262342;$$3272 = 0;$$4325 = $80;$$pr = $81;
      break;
     }
     $arglist_current = HEAP32[$2>>2]|0;
     $99 = $arglist_current;
     $100 = ((0) + 4|0);
     $expanded4 = $100;
     $expanded = (($expanded4) - 1)|0;
     $101 = (($99) + ($expanded))|0;
     $102 = ((0) + 4|0);
     $expanded8 = $102;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $103 = $101 & $expanded6;
     $104 = $103;
     $105 = HEAP32[$104>>2]|0;
     $arglist_next = ((($104)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $$0259 = $105;$$2271 = 0;$storemerge278 = $80;
    }
    $106 = ($$0259|0)<(0);
    $107 = $$0262342 | 8192;
    $108 = (0 - ($$0259))|0;
    $$$0262 = $106 ? $107 : $$0262342;
    $$$0259 = $106 ? $108 : $$0259;
    $$pre453 = HEAP8[$storemerge278>>0]|0;
    $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$$4325 = $storemerge278;$$pr = $$pre453;
   } else {
    $109 = $78 << 24 >> 24;
    $isdigittmp4$i = (($109) + -48)|0;
    $isdigit5$i = ($isdigittmp4$i>>>0)<(10);
    if ($isdigit5$i) {
     $$06$i = 0;$113 = $storemerge273345;$isdigittmp7$i = $isdigittmp4$i;
     while(1) {
      $110 = ($$06$i*10)|0;
      $111 = (($110) + ($isdigittmp7$i))|0;
      $112 = ((($113)) + 1|0);
      $114 = HEAP8[$112>>0]|0;
      $115 = $114 << 24 >> 24;
      $isdigittmp$i = (($115) + -48)|0;
      $isdigit$i = ($isdigittmp$i>>>0)<(10);
      if ($isdigit$i) {
       $$06$i = $111;$113 = $112;$isdigittmp7$i = $isdigittmp$i;
      } else {
       break;
      }
     }
     $116 = ($111|0)<(0);
     if ($116) {
      $$0 = -1;
      break L1;
     } else {
      $$1260 = $111;$$1263 = $$0262342;$$3272 = $$1270;$$4325 = $112;$$pr = $114;
     }
    } else {
     $$1260 = 0;$$1263 = $$0262342;$$3272 = $$1270;$$4325 = $storemerge273345;$$pr = $78;
    }
   }
  } while(0);
  $117 = ($$pr<<24>>24)==(46);
  L45: do {
   if ($117) {
    $118 = ((($$4325)) + 1|0);
    $119 = HEAP8[$118>>0]|0;
    $120 = ($119<<24>>24)==(42);
    if (!($120)) {
     $147 = $119 << 24 >> 24;
     $isdigittmp4$i287 = (($147) + -48)|0;
     $isdigit5$i288 = ($isdigittmp4$i287>>>0)<(10);
     if ($isdigit5$i288) {
      $$06$i290 = 0;$151 = $118;$isdigittmp7$i289 = $isdigittmp4$i287;
     } else {
      $$0254 = 0;$$6 = $118;
      break;
     }
     while(1) {
      $148 = ($$06$i290*10)|0;
      $149 = (($148) + ($isdigittmp7$i289))|0;
      $150 = ((($151)) + 1|0);
      $152 = HEAP8[$150>>0]|0;
      $153 = $152 << 24 >> 24;
      $isdigittmp$i291 = (($153) + -48)|0;
      $isdigit$i292 = ($isdigittmp$i291>>>0)<(10);
      if ($isdigit$i292) {
       $$06$i290 = $149;$151 = $150;$isdigittmp7$i289 = $isdigittmp$i291;
      } else {
       $$0254 = $149;$$6 = $150;
       break L45;
      }
     }
    }
    $121 = ((($$4325)) + 2|0);
    $122 = HEAP8[$121>>0]|0;
    $123 = $122 << 24 >> 24;
    $isdigittmp274 = (($123) + -48)|0;
    $isdigit275 = ($isdigittmp274>>>0)<(10);
    if ($isdigit275) {
     $124 = ((($$4325)) + 3|0);
     $125 = HEAP8[$124>>0]|0;
     $126 = ($125<<24>>24)==(36);
     if ($126) {
      $127 = (($4) + ($isdigittmp274<<2)|0);
      HEAP32[$127>>2] = 10;
      $128 = HEAP8[$121>>0]|0;
      $129 = $128 << 24 >> 24;
      $130 = (($129) + -48)|0;
      $131 = (($3) + ($130<<3)|0);
      $132 = $131;
      $133 = $132;
      $134 = HEAP32[$133>>2]|0;
      $135 = (($132) + 4)|0;
      $136 = $135;
      $137 = HEAP32[$136>>2]|0;
      $138 = ((($$4325)) + 4|0);
      $$0254 = $134;$$6 = $138;
      break;
     }
    }
    $139 = ($$3272|0)==(0);
    if (!($139)) {
     $$0 = -1;
     break L1;
    }
    if ($13) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $140 = $arglist_current2;
     $141 = ((0) + 4|0);
     $expanded11 = $141;
     $expanded10 = (($expanded11) - 1)|0;
     $142 = (($140) + ($expanded10))|0;
     $143 = ((0) + 4|0);
     $expanded15 = $143;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $144 = $142 & $expanded13;
     $145 = $144;
     $146 = HEAP32[$145>>2]|0;
     $arglist_next3 = ((($145)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $$0254 = $146;$$6 = $121;
    } else {
     $$0254 = 0;$$6 = $121;
    }
   } else {
    $$0254 = -1;$$6 = $$4325;
   }
  } while(0);
  $$0252 = 0;$$7 = $$6;
  while(1) {
   $154 = HEAP8[$$7>>0]|0;
   $155 = $154 << 24 >> 24;
   $156 = (($155) + -65)|0;
   $157 = ($156>>>0)>(57);
   if ($157) {
    $$0 = -1;
    break L1;
   }
   $158 = ((($$7)) + 1|0);
   $159 = ((715 + (($$0252*58)|0)|0) + ($156)|0);
   $160 = HEAP8[$159>>0]|0;
   $161 = $160&255;
   $162 = (($161) + -1)|0;
   $163 = ($162>>>0)<(8);
   if ($163) {
    $$0252 = $161;$$7 = $158;
   } else {
    break;
   }
  }
  $164 = ($160<<24>>24)==(0);
  if ($164) {
   $$0 = -1;
   break;
  }
  $165 = ($160<<24>>24)==(19);
  $166 = ($$0253|0)>(-1);
  do {
   if ($165) {
    if ($166) {
     $$0 = -1;
     break L1;
    } else {
     label = 51;
    }
   } else {
    if ($166) {
     $167 = (($4) + ($$0253<<2)|0);
     HEAP32[$167>>2] = $161;
     $168 = (($3) + ($$0253<<3)|0);
     $169 = $168;
     $170 = $169;
     $171 = HEAP32[$170>>2]|0;
     $172 = (($169) + 4)|0;
     $173 = $172;
     $174 = HEAP32[$173>>2]|0;
     $175 = $9;
     $176 = $175;
     HEAP32[$176>>2] = $171;
     $177 = (($175) + 4)|0;
     $178 = $177;
     HEAP32[$178>>2] = $174;
     label = 51;
     break;
    }
    if (!($13)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg_257($9,$161,$2);
   }
  } while(0);
  if ((label|0) == 51) {
   label = 0;
   if (!($13)) {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
    continue;
   }
  }
  $179 = HEAP8[$$7>>0]|0;
  $180 = $179 << 24 >> 24;
  $181 = ($$0252|0)!=(0);
  $182 = $180 & 15;
  $183 = ($182|0)==(3);
  $or$cond280 = $181 & $183;
  $184 = $180 & -33;
  $$0235 = $or$cond280 ? $184 : $180;
  $185 = $$1263 & 8192;
  $186 = ($185|0)==(0);
  $187 = $$1263 & -65537;
  $$1263$ = $186 ? $$1263 : $187;
  L74: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $194 = HEAP32[$9>>2]|0;
     HEAP32[$194>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 1:  {
     $195 = HEAP32[$9>>2]|0;
     HEAP32[$195>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 2:  {
     $196 = ($$1248|0)<(0);
     $197 = $196 << 31 >> 31;
     $198 = HEAP32[$9>>2]|0;
     $199 = $198;
     $200 = $199;
     HEAP32[$200>>2] = $$1248;
     $201 = (($199) + 4)|0;
     $202 = $201;
     HEAP32[$202>>2] = $197;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 3:  {
     $203 = $$1248&65535;
     $204 = HEAP32[$9>>2]|0;
     HEAP16[$204>>1] = $203;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 4:  {
     $205 = $$1248&255;
     $206 = HEAP32[$9>>2]|0;
     HEAP8[$206>>0] = $205;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 6:  {
     $207 = HEAP32[$9>>2]|0;
     HEAP32[$207>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    case 7:  {
     $208 = ($$1248|0)<(0);
     $209 = $208 << 31 >> 31;
     $210 = HEAP32[$9>>2]|0;
     $211 = $210;
     $212 = $211;
     HEAP32[$212>>2] = $$1248;
     $213 = (($211) + 4)|0;
     $214 = $213;
     HEAP32[$214>>2] = $209;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $215 = ($$0254>>>0)>(8);
    $216 = $215 ? $$0254 : 8;
    $217 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $216;$$3265 = $217;
    label = 63;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 63;
    break;
   }
   case 111:  {
    $257 = $9;
    $258 = $257;
    $259 = HEAP32[$258>>2]|0;
    $260 = (($257) + 4)|0;
    $261 = $260;
    $262 = HEAP32[$261>>2]|0;
    $263 = ($259|0)==(0);
    $264 = ($262|0)==(0);
    $265 = $263 & $264;
    if ($265) {
     $$0$lcssa$i300 = $14;
    } else {
     $$06$i298 = $14;$267 = $259;$271 = $262;
     while(1) {
      $266 = $267 & 7;
      $268 = $266 | 48;
      $269 = $268&255;
      $270 = ((($$06$i298)) + -1|0);
      HEAP8[$270>>0] = $269;
      $272 = (_bitshift64Lshr(($267|0),($271|0),3)|0);
      $273 = tempRet0;
      $274 = ($272|0)==(0);
      $275 = ($273|0)==(0);
      $276 = $274 & $275;
      if ($276) {
       $$0$lcssa$i300 = $270;
       break;
      } else {
       $$06$i298 = $270;$267 = $272;$271 = $273;
      }
     }
    }
    $277 = $$1263$ & 8;
    $278 = ($277|0)==(0);
    if ($278) {
     $$0228 = $$0$lcssa$i300;$$1233 = 0;$$1238 = 1195;$$2256 = $$0254;$$4266 = $$1263$;
     label = 76;
    } else {
     $279 = $$0$lcssa$i300;
     $280 = (($15) - ($279))|0;
     $281 = ($$0254|0)>($280|0);
     $282 = (($280) + 1)|0;
     $$0254$ = $281 ? $$0254 : $282;
     $$0228 = $$0$lcssa$i300;$$1233 = 0;$$1238 = 1195;$$2256 = $$0254$;$$4266 = $$1263$;
     label = 76;
    }
    break;
   }
   case 105: case 100:  {
    $283 = $9;
    $284 = $283;
    $285 = HEAP32[$284>>2]|0;
    $286 = (($283) + 4)|0;
    $287 = $286;
    $288 = HEAP32[$287>>2]|0;
    $289 = ($288|0)<(0);
    if ($289) {
     $290 = (_i64Subtract(0,0,($285|0),($288|0))|0);
     $291 = tempRet0;
     $292 = $9;
     $293 = $292;
     HEAP32[$293>>2] = $290;
     $294 = (($292) + 4)|0;
     $295 = $294;
     HEAP32[$295>>2] = $291;
     $$0232 = 1;$$0237 = 1195;$300 = $290;$301 = $291;
     label = 75;
     break L74;
    }
    $296 = $$1263$ & 2048;
    $297 = ($296|0)==(0);
    if ($297) {
     $298 = $$1263$ & 1;
     $299 = ($298|0)==(0);
     $$ = $299 ? 1195 : (1197);
     $$0232 = $298;$$0237 = $$;$300 = $285;$301 = $288;
     label = 75;
    } else {
     $$0232 = 1;$$0237 = (1196);$300 = $285;$301 = $288;
     label = 75;
    }
    break;
   }
   case 117:  {
    $188 = $9;
    $189 = $188;
    $190 = HEAP32[$189>>2]|0;
    $191 = (($188) + 4)|0;
    $192 = $191;
    $193 = HEAP32[$192>>2]|0;
    $$0232 = 0;$$0237 = 1195;$300 = $190;$301 = $193;
    label = 75;
    break;
   }
   case 99:  {
    $321 = $9;
    $322 = $321;
    $323 = HEAP32[$322>>2]|0;
    $324 = (($321) + 4)|0;
    $325 = $324;
    $326 = HEAP32[$325>>2]|0;
    $327 = $323&255;
    HEAP8[$16>>0] = $327;
    $$2 = $16;$$2234 = 0;$$2239 = 1195;$$2251 = $14;$$5 = 1;$$6268 = $187;
    break;
   }
   case 109:  {
    $328 = (___errno_location()|0);
    $329 = HEAP32[$328>>2]|0;
    $330 = (_strerror($329)|0);
    $$1 = $330;
    label = 81;
    break;
   }
   case 115:  {
    $331 = HEAP32[$9>>2]|0;
    $332 = ($331|0)!=(0|0);
    $333 = $332 ? $331 : 1205;
    $$1 = $333;
    label = 81;
    break;
   }
   case 67:  {
    $340 = $9;
    $341 = $340;
    $342 = HEAP32[$341>>2]|0;
    $343 = (($340) + 4)|0;
    $344 = $343;
    $345 = HEAP32[$344>>2]|0;
    HEAP32[$11>>2] = $342;
    HEAP32[$17>>2] = 0;
    HEAP32[$9>>2] = $11;
    $$4258458 = -1;$809 = $11;
    label = 85;
    break;
   }
   case 83:  {
    $$pre454 = HEAP32[$9>>2]|0;
    $346 = ($$0254|0)==(0);
    if ($346) {
     _pad($0,32,$$1260,0,$$1263$);
     $$0240$lcssa460 = 0;
     label = 96;
    } else {
     $$4258458 = $$0254;$809 = $$pre454;
     label = 85;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $371 = +HEAPF64[$9>>3];
    HEAP32[$6>>2] = 0;
    HEAPF64[tempDoublePtr>>3] = $371;$372 = HEAP32[tempDoublePtr>>2]|0;
    $373 = HEAP32[tempDoublePtr+4>>2]|0;
    $374 = ($373|0)<(0);
    if ($374) {
     $375 = -$371;
     $$0471$i = $375;$$0520$i = 1;$$0522$i = 1212;
    } else {
     $376 = $$1263$ & 2048;
     $377 = ($376|0)==(0);
     $378 = $$1263$ & 1;
     if ($377) {
      $379 = ($378|0)==(0);
      $$$i = $379 ? (1213) : (1218);
      $$0471$i = $371;$$0520$i = $378;$$0522$i = $$$i;
     } else {
      $$0471$i = $371;$$0520$i = 1;$$0522$i = (1215);
     }
    }
    HEAPF64[tempDoublePtr>>3] = $$0471$i;$380 = HEAP32[tempDoublePtr>>2]|0;
    $381 = HEAP32[tempDoublePtr+4>>2]|0;
    $382 = $381 & 2146435072;
    $383 = ($382>>>0)<(2146435072);
    $384 = (0)<(0);
    $385 = ($382|0)==(2146435072);
    $386 = $385 & $384;
    $387 = $383 | $386;
    do {
     if ($387) {
      $403 = (+_frexpl($$0471$i,$6));
      $404 = $403 * 2.0;
      $405 = $404 != 0.0;
      if ($405) {
       $406 = HEAP32[$6>>2]|0;
       $407 = (($406) + -1)|0;
       HEAP32[$6>>2] = $407;
      }
      $408 = $$0235 | 32;
      $409 = ($408|0)==(97);
      if ($409) {
       $410 = $$0235 & 32;
       $411 = ($410|0)==(0);
       $412 = ((($$0522$i)) + 9|0);
       $$0522$$i = $411 ? $$0522$i : $412;
       $413 = $$0520$i | 2;
       $414 = ($$0254>>>0)>(11);
       $415 = (12 - ($$0254))|0;
       $416 = ($415|0)==(0);
       $417 = $414 | $416;
       do {
        if ($417) {
         $$1472$i = $404;
        } else {
         $$0509592$i = 8.0;$$1508593$i = $415;
         while(1) {
          $418 = (($$1508593$i) + -1)|0;
          $419 = $$0509592$i * 16.0;
          $420 = ($418|0)==(0);
          if ($420) {
           break;
          } else {
           $$0509592$i = $419;$$1508593$i = $418;
          }
         }
         $421 = HEAP8[$$0522$$i>>0]|0;
         $422 = ($421<<24>>24)==(45);
         if ($422) {
          $423 = -$404;
          $424 = $423 - $419;
          $425 = $419 + $424;
          $426 = -$425;
          $$1472$i = $426;
          break;
         } else {
          $427 = $404 + $419;
          $428 = $427 - $419;
          $$1472$i = $428;
          break;
         }
        }
       } while(0);
       $429 = HEAP32[$6>>2]|0;
       $430 = ($429|0)<(0);
       $431 = (0 - ($429))|0;
       $432 = $430 ? $431 : $429;
       $433 = ($432|0)<(0);
       $434 = $433 << 31 >> 31;
       $435 = (_fmt_u($432,$434,$20)|0);
       $436 = ($435|0)==($20|0);
       if ($436) {
        HEAP8[$21>>0] = 48;
        $$0511$i = $21;
       } else {
        $$0511$i = $435;
       }
       $437 = $429 >> 31;
       $438 = $437 & 2;
       $439 = (($438) + 43)|0;
       $440 = $439&255;
       $441 = ((($$0511$i)) + -1|0);
       HEAP8[$441>>0] = $440;
       $442 = (($$0235) + 15)|0;
       $443 = $442&255;
       $444 = ((($$0511$i)) + -2|0);
       HEAP8[$444>>0] = $443;
       $notrhs$i = ($$0254|0)<(1);
       $445 = $$1263$ & 8;
       $446 = ($445|0)==(0);
       $$0524$i = $7;$$2473$i = $$1472$i;
       while(1) {
        $447 = (~~(($$2473$i)));
        $448 = (1179 + ($447)|0);
        $449 = HEAP8[$448>>0]|0;
        $450 = $449&255;
        $451 = $450 | $410;
        $452 = $451&255;
        $453 = ((($$0524$i)) + 1|0);
        HEAP8[$$0524$i>>0] = $452;
        $454 = (+($447|0));
        $455 = $$2473$i - $454;
        $456 = $455 * 16.0;
        $457 = $453;
        $458 = (($457) - ($18))|0;
        $459 = ($458|0)==(1);
        do {
         if ($459) {
          $notlhs$i = $456 == 0.0;
          $or$cond3$not$i = $notrhs$i & $notlhs$i;
          $or$cond$i = $446 & $or$cond3$not$i;
          if ($or$cond$i) {
           $$1525$i = $453;
           break;
          }
          $460 = ((($$0524$i)) + 2|0);
          HEAP8[$453>>0] = 46;
          $$1525$i = $460;
         } else {
          $$1525$i = $453;
         }
        } while(0);
        $461 = $456 != 0.0;
        if ($461) {
         $$0524$i = $$1525$i;$$2473$i = $456;
        } else {
         break;
        }
       }
       $462 = ($$0254|0)!=(0);
       $$pre700$i = $$1525$i;
       $463 = (($24) + ($$pre700$i))|0;
       $464 = ($463|0)<($$0254|0);
       $or$cond412 = $462 & $464;
       $465 = $444;
       $466 = (($25) + ($$0254))|0;
       $467 = (($466) - ($465))|0;
       $468 = (($23) - ($465))|0;
       $469 = (($468) + ($$pre700$i))|0;
       $$0526$i = $or$cond412 ? $467 : $469;
       $470 = (($$0526$i) + ($413))|0;
       _pad($0,32,$$1260,$470,$$1263$);
       $471 = HEAP32[$0>>2]|0;
       $472 = $471 & 32;
       $473 = ($472|0)==(0);
       if ($473) {
        (___fwritex($$0522$$i,$413,$0)|0);
       }
       $474 = $$1263$ ^ 65536;
       _pad($0,48,$$1260,$470,$474);
       $475 = (($$pre700$i) - ($18))|0;
       $476 = HEAP32[$0>>2]|0;
       $477 = $476 & 32;
       $478 = ($477|0)==(0);
       if ($478) {
        (___fwritex($7,$475,$0)|0);
       }
       $479 = (($22) - ($465))|0;
       $sum = (($475) + ($479))|0;
       $480 = (($$0526$i) - ($sum))|0;
       _pad($0,48,$480,0,0);
       $481 = HEAP32[$0>>2]|0;
       $482 = $481 & 32;
       $483 = ($482|0)==(0);
       if ($483) {
        (___fwritex($444,$479,$0)|0);
       }
       $484 = $$1263$ ^ 8192;
       _pad($0,32,$$1260,$470,$484);
       $485 = ($470|0)<($$1260|0);
       $$537$i = $485 ? $$1260 : $470;
       $$0470$i = $$537$i;
       break;
      }
      $486 = ($$0254|0)<(0);
      $$538$i = $486 ? 6 : $$0254;
      if ($405) {
       $487 = $404 * 268435456.0;
       $488 = HEAP32[$6>>2]|0;
       $489 = (($488) + -28)|0;
       HEAP32[$6>>2] = $489;
       $$3$i = $487;$$pr$i = $489;
      } else {
       $$pre697$i = HEAP32[$6>>2]|0;
       $$3$i = $404;$$pr$i = $$pre697$i;
      }
      $490 = ($$pr$i|0)<(0);
      $$554$i = $490 ? $5 : $26;
      $$0498$i = $$554$i;$$4$i = $$3$i;
      while(1) {
       $491 = (~~(($$4$i))>>>0);
       HEAP32[$$0498$i>>2] = $491;
       $492 = ((($$0498$i)) + 4|0);
       $493 = (+($491>>>0));
       $494 = $$4$i - $493;
       $495 = $494 * 1.0E+9;
       $496 = $495 != 0.0;
       if ($496) {
        $$0498$i = $492;$$4$i = $495;
       } else {
        break;
       }
      }
      $497 = ($$pr$i|0)>(0);
      if ($497) {
       $$1482671$i = $$554$i;$$1499670$i = $492;$498 = $$pr$i;
       while(1) {
        $499 = ($498|0)>(29);
        $500 = $499 ? 29 : $498;
        $$0488663$i = ((($$1499670$i)) + -4|0);
        $501 = ($$0488663$i>>>0)<($$1482671$i>>>0);
        do {
         if ($501) {
          $$2483$ph$i = $$1482671$i;
         } else {
          $$0488665$i = $$0488663$i;$$0497664$i = 0;
          while(1) {
           $502 = HEAP32[$$0488665$i>>2]|0;
           $503 = (_bitshift64Shl(($502|0),0,($500|0))|0);
           $504 = tempRet0;
           $505 = (_i64Add(($503|0),($504|0),($$0497664$i|0),0)|0);
           $506 = tempRet0;
           $507 = (___uremdi3(($505|0),($506|0),1000000000,0)|0);
           $508 = tempRet0;
           HEAP32[$$0488665$i>>2] = $507;
           $509 = (___udivdi3(($505|0),($506|0),1000000000,0)|0);
           $510 = tempRet0;
           $$0488$i = ((($$0488665$i)) + -4|0);
           $511 = ($$0488$i>>>0)<($$1482671$i>>>0);
           if ($511) {
            break;
           } else {
            $$0488665$i = $$0488$i;$$0497664$i = $509;
           }
          }
          $512 = ($509|0)==(0);
          if ($512) {
           $$2483$ph$i = $$1482671$i;
           break;
          }
          $513 = ((($$1482671$i)) + -4|0);
          HEAP32[$513>>2] = $509;
          $$2483$ph$i = $513;
         }
        } while(0);
        $$2500$i = $$1499670$i;
        while(1) {
         $514 = ($$2500$i>>>0)>($$2483$ph$i>>>0);
         if (!($514)) {
          break;
         }
         $515 = ((($$2500$i)) + -4|0);
         $516 = HEAP32[$515>>2]|0;
         $517 = ($516|0)==(0);
         if ($517) {
          $$2500$i = $515;
         } else {
          break;
         }
        }
        $518 = HEAP32[$6>>2]|0;
        $519 = (($518) - ($500))|0;
        HEAP32[$6>>2] = $519;
        $520 = ($519|0)>(0);
        if ($520) {
         $$1482671$i = $$2483$ph$i;$$1499670$i = $$2500$i;$498 = $519;
        } else {
         $$1482$lcssa$i = $$2483$ph$i;$$1499$lcssa$i = $$2500$i;$$pr571$i = $519;
         break;
        }
       }
      } else {
       $$1482$lcssa$i = $$554$i;$$1499$lcssa$i = $492;$$pr571$i = $$pr$i;
      }
      $521 = ($$pr571$i|0)<(0);
      if ($521) {
       $522 = (($$538$i) + 25)|0;
       $523 = (($522|0) / 9)&-1;
       $524 = (($523) + 1)|0;
       $525 = ($408|0)==(102);
       $$3484658$i = $$1482$lcssa$i;$$3501657$i = $$1499$lcssa$i;$527 = $$pr571$i;
       while(1) {
        $526 = (0 - ($527))|0;
        $528 = ($526|0)>(9);
        $529 = $528 ? 9 : $526;
        $530 = ($$3484658$i>>>0)<($$3501657$i>>>0);
        do {
         if ($530) {
          $534 = 1 << $529;
          $535 = (($534) + -1)|0;
          $536 = 1000000000 >>> $529;
          $$0487652$i = 0;$$1489651$i = $$3484658$i;
          while(1) {
           $537 = HEAP32[$$1489651$i>>2]|0;
           $538 = $537 & $535;
           $539 = $537 >>> $529;
           $540 = (($539) + ($$0487652$i))|0;
           HEAP32[$$1489651$i>>2] = $540;
           $541 = Math_imul($538, $536)|0;
           $542 = ((($$1489651$i)) + 4|0);
           $543 = ($542>>>0)<($$3501657$i>>>0);
           if ($543) {
            $$0487652$i = $541;$$1489651$i = $542;
           } else {
            break;
           }
          }
          $544 = HEAP32[$$3484658$i>>2]|0;
          $545 = ($544|0)==(0);
          $546 = ((($$3484658$i)) + 4|0);
          $$$3484$i = $545 ? $546 : $$3484658$i;
          $547 = ($541|0)==(0);
          if ($547) {
           $$$3484706$i = $$$3484$i;$$4502$i = $$3501657$i;
           break;
          }
          $548 = ((($$3501657$i)) + 4|0);
          HEAP32[$$3501657$i>>2] = $541;
          $$$3484706$i = $$$3484$i;$$4502$i = $548;
         } else {
          $531 = HEAP32[$$3484658$i>>2]|0;
          $532 = ($531|0)==(0);
          $533 = ((($$3484658$i)) + 4|0);
          $$$3484705$i = $532 ? $533 : $$3484658$i;
          $$$3484706$i = $$$3484705$i;$$4502$i = $$3501657$i;
         }
        } while(0);
        $549 = $525 ? $$554$i : $$$3484706$i;
        $550 = $$4502$i;
        $551 = $549;
        $552 = (($550) - ($551))|0;
        $553 = $552 >> 2;
        $554 = ($553|0)>($524|0);
        $555 = (($549) + ($524<<2)|0);
        $$$4502$i = $554 ? $555 : $$4502$i;
        $556 = HEAP32[$6>>2]|0;
        $557 = (($556) + ($529))|0;
        HEAP32[$6>>2] = $557;
        $558 = ($557|0)<(0);
        if ($558) {
         $$3484658$i = $$$3484706$i;$$3501657$i = $$$4502$i;$527 = $557;
        } else {
         $$3484$lcssa$i = $$$3484706$i;$$3501$lcssa$i = $$$4502$i;
         break;
        }
       }
      } else {
       $$3484$lcssa$i = $$1482$lcssa$i;$$3501$lcssa$i = $$1499$lcssa$i;
      }
      $559 = ($$3484$lcssa$i>>>0)<($$3501$lcssa$i>>>0);
      $560 = $$554$i;
      do {
       if ($559) {
        $561 = $$3484$lcssa$i;
        $562 = (($560) - ($561))|0;
        $563 = $562 >> 2;
        $564 = ($563*9)|0;
        $565 = HEAP32[$$3484$lcssa$i>>2]|0;
        $566 = ($565>>>0)<(10);
        if ($566) {
         $$1515$i = $564;
         break;
        } else {
         $$0514647$i = $564;$$0531646$i = 10;
        }
        while(1) {
         $567 = ($$0531646$i*10)|0;
         $568 = (($$0514647$i) + 1)|0;
         $569 = ($565>>>0)<($567>>>0);
         if ($569) {
          $$1515$i = $568;
          break;
         } else {
          $$0514647$i = $568;$$0531646$i = $567;
         }
        }
       } else {
        $$1515$i = 0;
       }
      } while(0);
      $570 = ($408|0)!=(102);
      $571 = $570 ? $$1515$i : 0;
      $572 = (($$538$i) - ($571))|0;
      $573 = ($408|0)==(103);
      $574 = ($$538$i|0)!=(0);
      $575 = $574 & $573;
      $$neg$i = $575 << 31 >> 31;
      $576 = (($572) + ($$neg$i))|0;
      $577 = $$3501$lcssa$i;
      $578 = (($577) - ($560))|0;
      $579 = $578 >> 2;
      $580 = ($579*9)|0;
      $581 = (($580) + -9)|0;
      $582 = ($576|0)<($581|0);
      if ($582) {
       $583 = ((($$554$i)) + 4|0);
       $584 = (($576) + 9216)|0;
       $585 = (($584|0) / 9)&-1;
       $586 = (($585) + -1024)|0;
       $587 = (($583) + ($586<<2)|0);
       $588 = (($584|0) % 9)&-1;
       $$0528639$i = (($588) + 1)|0;
       $589 = ($$0528639$i|0)<(9);
       if ($589) {
        $$0528641$i = $$0528639$i;$$1532640$i = 10;
        while(1) {
         $590 = ($$1532640$i*10)|0;
         $$0528$i = (($$0528641$i) + 1)|0;
         $exitcond$i = ($$0528$i|0)==(9);
         if ($exitcond$i) {
          $$1532$lcssa$i = $590;
          break;
         } else {
          $$0528641$i = $$0528$i;$$1532640$i = $590;
         }
        }
       } else {
        $$1532$lcssa$i = 10;
       }
       $591 = HEAP32[$587>>2]|0;
       $592 = (($591>>>0) % ($$1532$lcssa$i>>>0))&-1;
       $593 = ($592|0)==(0);
       $594 = ((($587)) + 4|0);
       $595 = ($594|0)==($$3501$lcssa$i|0);
       $or$cond540$i = $595 & $593;
       do {
        if ($or$cond540$i) {
         $$4492$i = $587;$$4518$i = $$1515$i;$$8$i = $$3484$lcssa$i;
        } else {
         $596 = (($591>>>0) / ($$1532$lcssa$i>>>0))&-1;
         $597 = $596 & 1;
         $598 = ($597|0)==(0);
         $$541$i = $598 ? 9007199254740992.0 : 9007199254740994.0;
         $599 = (($$1532$lcssa$i|0) / 2)&-1;
         $600 = ($592>>>0)<($599>>>0);
         if ($600) {
          $$0466$i = 0.5;
         } else {
          $601 = ($592|0)==($599|0);
          $or$cond543$i = $595 & $601;
          $$557$i = $or$cond543$i ? 1.0 : 1.5;
          $$0466$i = $$557$i;
         }
         $602 = ($$0520$i|0)==(0);
         do {
          if ($602) {
           $$1467$i = $$0466$i;$$1469$i = $$541$i;
          } else {
           $603 = HEAP8[$$0522$i>>0]|0;
           $604 = ($603<<24>>24)==(45);
           if (!($604)) {
            $$1467$i = $$0466$i;$$1469$i = $$541$i;
            break;
           }
           $605 = -$$541$i;
           $606 = -$$0466$i;
           $$1467$i = $606;$$1469$i = $605;
          }
         } while(0);
         $607 = (($591) - ($592))|0;
         HEAP32[$587>>2] = $607;
         $608 = $$1469$i + $$1467$i;
         $609 = $608 != $$1469$i;
         if (!($609)) {
          $$4492$i = $587;$$4518$i = $$1515$i;$$8$i = $$3484$lcssa$i;
          break;
         }
         $610 = (($607) + ($$1532$lcssa$i))|0;
         HEAP32[$587>>2] = $610;
         $611 = ($610>>>0)>(999999999);
         if ($611) {
          $$2490632$i = $587;$$5486633$i = $$3484$lcssa$i;
          while(1) {
           $612 = ((($$2490632$i)) + -4|0);
           HEAP32[$$2490632$i>>2] = 0;
           $613 = ($612>>>0)<($$5486633$i>>>0);
           if ($613) {
            $614 = ((($$5486633$i)) + -4|0);
            HEAP32[$614>>2] = 0;
            $$6$i = $614;
           } else {
            $$6$i = $$5486633$i;
           }
           $615 = HEAP32[$612>>2]|0;
           $616 = (($615) + 1)|0;
           HEAP32[$612>>2] = $616;
           $617 = ($616>>>0)>(999999999);
           if ($617) {
            $$2490632$i = $612;$$5486633$i = $$6$i;
           } else {
            $$2490$lcssa$i = $612;$$5486$lcssa$i = $$6$i;
            break;
           }
          }
         } else {
          $$2490$lcssa$i = $587;$$5486$lcssa$i = $$3484$lcssa$i;
         }
         $618 = $$5486$lcssa$i;
         $619 = (($560) - ($618))|0;
         $620 = $619 >> 2;
         $621 = ($620*9)|0;
         $622 = HEAP32[$$5486$lcssa$i>>2]|0;
         $623 = ($622>>>0)<(10);
         if ($623) {
          $$4492$i = $$2490$lcssa$i;$$4518$i = $621;$$8$i = $$5486$lcssa$i;
          break;
         } else {
          $$2516628$i = $621;$$2533627$i = 10;
         }
         while(1) {
          $624 = ($$2533627$i*10)|0;
          $625 = (($$2516628$i) + 1)|0;
          $626 = ($622>>>0)<($624>>>0);
          if ($626) {
           $$4492$i = $$2490$lcssa$i;$$4518$i = $625;$$8$i = $$5486$lcssa$i;
           break;
          } else {
           $$2516628$i = $625;$$2533627$i = $624;
          }
         }
        }
       } while(0);
       $627 = ((($$4492$i)) + 4|0);
       $628 = ($$3501$lcssa$i>>>0)>($627>>>0);
       $$$3501$i = $628 ? $627 : $$3501$lcssa$i;
       $$5519$ph$i = $$4518$i;$$7505$ph$i = $$$3501$i;$$9$ph$i = $$8$i;
      } else {
       $$5519$ph$i = $$1515$i;$$7505$ph$i = $$3501$lcssa$i;$$9$ph$i = $$3484$lcssa$i;
      }
      $629 = (0 - ($$5519$ph$i))|0;
      $$7505$i = $$7505$ph$i;
      while(1) {
       $630 = ($$7505$i>>>0)>($$9$ph$i>>>0);
       if (!($630)) {
        $$lcssa683$i = 0;
        break;
       }
       $631 = ((($$7505$i)) + -4|0);
       $632 = HEAP32[$631>>2]|0;
       $633 = ($632|0)==(0);
       if ($633) {
        $$7505$i = $631;
       } else {
        $$lcssa683$i = 1;
        break;
       }
      }
      do {
       if ($573) {
        $634 = $574&1;
        $635 = $634 ^ 1;
        $$538$$i = (($635) + ($$538$i))|0;
        $636 = ($$538$$i|0)>($$5519$ph$i|0);
        $637 = ($$5519$ph$i|0)>(-5);
        $or$cond6$i = $636 & $637;
        if ($or$cond6$i) {
         $638 = (($$0235) + -1)|0;
         $$neg572$i = (($$538$$i) + -1)|0;
         $639 = (($$neg572$i) - ($$5519$ph$i))|0;
         $$0479$i = $638;$$2476$i = $639;
        } else {
         $640 = (($$0235) + -2)|0;
         $641 = (($$538$$i) + -1)|0;
         $$0479$i = $640;$$2476$i = $641;
        }
        $642 = $$1263$ & 8;
        $643 = ($642|0)==(0);
        if (!($643)) {
         $$1480$i = $$0479$i;$$3477$i = $$2476$i;$$pre$phi704$iZ2D = $642;
         break;
        }
        do {
         if ($$lcssa683$i) {
          $644 = ((($$7505$i)) + -4|0);
          $645 = HEAP32[$644>>2]|0;
          $646 = ($645|0)==(0);
          if ($646) {
           $$2530$i = 9;
           break;
          }
          $647 = (($645>>>0) % 10)&-1;
          $648 = ($647|0)==(0);
          if ($648) {
           $$1529624$i = 0;$$3534623$i = 10;
          } else {
           $$2530$i = 0;
           break;
          }
          while(1) {
           $649 = ($$3534623$i*10)|0;
           $650 = (($$1529624$i) + 1)|0;
           $651 = (($645>>>0) % ($649>>>0))&-1;
           $652 = ($651|0)==(0);
           if ($652) {
            $$1529624$i = $650;$$3534623$i = $649;
           } else {
            $$2530$i = $650;
            break;
           }
          }
         } else {
          $$2530$i = 9;
         }
        } while(0);
        $653 = $$0479$i | 32;
        $654 = ($653|0)==(102);
        $655 = $$7505$i;
        $656 = (($655) - ($560))|0;
        $657 = $656 >> 2;
        $658 = ($657*9)|0;
        $659 = (($658) + -9)|0;
        if ($654) {
         $660 = (($659) - ($$2530$i))|0;
         $661 = ($660|0)<(0);
         $$544$i = $661 ? 0 : $660;
         $662 = ($$2476$i|0)<($$544$i|0);
         $$2476$$545$i = $662 ? $$2476$i : $$544$i;
         $$1480$i = $$0479$i;$$3477$i = $$2476$$545$i;$$pre$phi704$iZ2D = 0;
         break;
        } else {
         $663 = (($659) + ($$5519$ph$i))|0;
         $664 = (($663) - ($$2530$i))|0;
         $665 = ($664|0)<(0);
         $$546$i = $665 ? 0 : $664;
         $666 = ($$2476$i|0)<($$546$i|0);
         $$2476$$547$i = $666 ? $$2476$i : $$546$i;
         $$1480$i = $$0479$i;$$3477$i = $$2476$$547$i;$$pre$phi704$iZ2D = 0;
         break;
        }
       } else {
        $$pre703$i = $$1263$ & 8;
        $$1480$i = $$0235;$$3477$i = $$538$i;$$pre$phi704$iZ2D = $$pre703$i;
       }
      } while(0);
      $667 = $$3477$i | $$pre$phi704$iZ2D;
      $668 = ($667|0)!=(0);
      $669 = $668&1;
      $670 = $$1480$i | 32;
      $671 = ($670|0)==(102);
      if ($671) {
       $672 = ($$5519$ph$i|0)>(0);
       $673 = $672 ? $$5519$ph$i : 0;
       $$2513$i = 0;$$pn$i = $673;
      } else {
       $674 = ($$5519$ph$i|0)<(0);
       $675 = $674 ? $629 : $$5519$ph$i;
       $676 = ($675|0)<(0);
       $677 = $676 << 31 >> 31;
       $678 = (_fmt_u($675,$677,$20)|0);
       $679 = $678;
       $680 = (($22) - ($679))|0;
       $681 = ($680|0)<(2);
       if ($681) {
        $$1512617$i = $678;
        while(1) {
         $682 = ((($$1512617$i)) + -1|0);
         HEAP8[$682>>0] = 48;
         $683 = $682;
         $684 = (($22) - ($683))|0;
         $685 = ($684|0)<(2);
         if ($685) {
          $$1512617$i = $682;
         } else {
          $$1512$lcssa$i = $682;
          break;
         }
        }
       } else {
        $$1512$lcssa$i = $678;
       }
       $686 = $$5519$ph$i >> 31;
       $687 = $686 & 2;
       $688 = (($687) + 43)|0;
       $689 = $688&255;
       $690 = ((($$1512$lcssa$i)) + -1|0);
       HEAP8[$690>>0] = $689;
       $691 = $$1480$i&255;
       $692 = ((($$1512$lcssa$i)) + -2|0);
       HEAP8[$692>>0] = $691;
       $693 = $692;
       $694 = (($22) - ($693))|0;
       $$2513$i = $692;$$pn$i = $694;
      }
      $695 = (($$0520$i) + 1)|0;
      $696 = (($695) + ($$3477$i))|0;
      $$1527$i = (($696) + ($669))|0;
      $697 = (($$1527$i) + ($$pn$i))|0;
      _pad($0,32,$$1260,$697,$$1263$);
      $698 = HEAP32[$0>>2]|0;
      $699 = $698 & 32;
      $700 = ($699|0)==(0);
      if ($700) {
       (___fwritex($$0522$i,$$0520$i,$0)|0);
      }
      $701 = $$1263$ ^ 65536;
      _pad($0,48,$$1260,$697,$701);
      do {
       if ($671) {
        $702 = ($$9$ph$i>>>0)>($$554$i>>>0);
        $$0496$$9$i = $702 ? $$554$i : $$9$ph$i;
        $$5493606$i = $$0496$$9$i;
        while(1) {
         $703 = HEAP32[$$5493606$i>>2]|0;
         $704 = (_fmt_u($703,0,$27)|0);
         $705 = ($$5493606$i|0)==($$0496$$9$i|0);
         do {
          if ($705) {
           $711 = ($704|0)==($27|0);
           if (!($711)) {
            $$1465$i = $704;
            break;
           }
           HEAP8[$29>>0] = 48;
           $$1465$i = $29;
          } else {
           $706 = ($704>>>0)>($7>>>0);
           if (!($706)) {
            $$1465$i = $704;
            break;
           }
           $707 = $704;
           $708 = (($707) - ($18))|0;
           _memset(($7|0),48,($708|0))|0;
           $$0464603$i = $704;
           while(1) {
            $709 = ((($$0464603$i)) + -1|0);
            $710 = ($709>>>0)>($7>>>0);
            if ($710) {
             $$0464603$i = $709;
            } else {
             $$1465$i = $709;
             break;
            }
           }
          }
         } while(0);
         $712 = HEAP32[$0>>2]|0;
         $713 = $712 & 32;
         $714 = ($713|0)==(0);
         if ($714) {
          $715 = $$1465$i;
          $716 = (($28) - ($715))|0;
          (___fwritex($$1465$i,$716,$0)|0);
         }
         $717 = ((($$5493606$i)) + 4|0);
         $718 = ($717>>>0)>($$554$i>>>0);
         if ($718) {
          break;
         } else {
          $$5493606$i = $717;
         }
        }
        $719 = ($667|0)==(0);
        do {
         if (!($719)) {
          $720 = HEAP32[$0>>2]|0;
          $721 = $720 & 32;
          $722 = ($721|0)==(0);
          if (!($722)) {
           break;
          }
          (___fwritex(1247,1,$0)|0);
         }
        } while(0);
        $723 = ($717>>>0)<($$7505$i>>>0);
        $724 = ($$3477$i|0)>(0);
        $725 = $724 & $723;
        if ($725) {
         $$4478600$i = $$3477$i;$$6494599$i = $717;
         while(1) {
          $726 = HEAP32[$$6494599$i>>2]|0;
          $727 = (_fmt_u($726,0,$27)|0);
          $728 = ($727>>>0)>($7>>>0);
          if ($728) {
           $729 = $727;
           $730 = (($729) - ($18))|0;
           _memset(($7|0),48,($730|0))|0;
           $$0463594$i = $727;
           while(1) {
            $731 = ((($$0463594$i)) + -1|0);
            $732 = ($731>>>0)>($7>>>0);
            if ($732) {
             $$0463594$i = $731;
            } else {
             $$0463$lcssa$i = $731;
             break;
            }
           }
          } else {
           $$0463$lcssa$i = $727;
          }
          $733 = HEAP32[$0>>2]|0;
          $734 = $733 & 32;
          $735 = ($734|0)==(0);
          if ($735) {
           $736 = ($$4478600$i|0)>(9);
           $737 = $736 ? 9 : $$4478600$i;
           (___fwritex($$0463$lcssa$i,$737,$0)|0);
          }
          $738 = ((($$6494599$i)) + 4|0);
          $739 = (($$4478600$i) + -9)|0;
          $740 = ($738>>>0)<($$7505$i>>>0);
          $741 = ($$4478600$i|0)>(9);
          $742 = $741 & $740;
          if ($742) {
           $$4478600$i = $739;$$6494599$i = $738;
          } else {
           $$4478$lcssa$i = $739;
           break;
          }
         }
        } else {
         $$4478$lcssa$i = $$3477$i;
        }
        $743 = (($$4478$lcssa$i) + 9)|0;
        _pad($0,48,$743,9,0);
       } else {
        $744 = ((($$9$ph$i)) + 4|0);
        $$7505$$i = $$lcssa683$i ? $$7505$i : $744;
        $745 = ($$3477$i|0)>(-1);
        if ($745) {
         $746 = ($$pre$phi704$iZ2D|0)==(0);
         $$5611$i = $$3477$i;$$7495610$i = $$9$ph$i;
         while(1) {
          $747 = HEAP32[$$7495610$i>>2]|0;
          $748 = (_fmt_u($747,0,$27)|0);
          $749 = ($748|0)==($27|0);
          if ($749) {
           HEAP8[$29>>0] = 48;
           $$0$i = $29;
          } else {
           $$0$i = $748;
          }
          $750 = ($$7495610$i|0)==($$9$ph$i|0);
          do {
           if ($750) {
            $754 = ((($$0$i)) + 1|0);
            $755 = HEAP32[$0>>2]|0;
            $756 = $755 & 32;
            $757 = ($756|0)==(0);
            if ($757) {
             (___fwritex($$0$i,1,$0)|0);
            }
            $758 = ($$5611$i|0)<(1);
            $or$cond552$i = $746 & $758;
            if ($or$cond552$i) {
             $$2$i = $754;
             break;
            }
            $759 = HEAP32[$0>>2]|0;
            $760 = $759 & 32;
            $761 = ($760|0)==(0);
            if (!($761)) {
             $$2$i = $754;
             break;
            }
            (___fwritex(1247,1,$0)|0);
            $$2$i = $754;
           } else {
            $751 = ($$0$i>>>0)>($7>>>0);
            if (!($751)) {
             $$2$i = $$0$i;
             break;
            }
            $scevgep694$i = (($$0$i) + ($19)|0);
            $scevgep694695$i = $scevgep694$i;
            _memset(($7|0),48,($scevgep694695$i|0))|0;
            $$1607$i = $$0$i;
            while(1) {
             $752 = ((($$1607$i)) + -1|0);
             $753 = ($752>>>0)>($7>>>0);
             if ($753) {
              $$1607$i = $752;
             } else {
              $$2$i = $752;
              break;
             }
            }
           }
          } while(0);
          $762 = $$2$i;
          $763 = (($28) - ($762))|0;
          $764 = HEAP32[$0>>2]|0;
          $765 = $764 & 32;
          $766 = ($765|0)==(0);
          if ($766) {
           $767 = ($$5611$i|0)>($763|0);
           $768 = $767 ? $763 : $$5611$i;
           (___fwritex($$2$i,$768,$0)|0);
          }
          $769 = (($$5611$i) - ($763))|0;
          $770 = ((($$7495610$i)) + 4|0);
          $771 = ($770>>>0)<($$7505$$i>>>0);
          $772 = ($769|0)>(-1);
          $773 = $771 & $772;
          if ($773) {
           $$5611$i = $769;$$7495610$i = $770;
          } else {
           $$5$lcssa$i = $769;
           break;
          }
         }
        } else {
         $$5$lcssa$i = $$3477$i;
        }
        $774 = (($$5$lcssa$i) + 18)|0;
        _pad($0,48,$774,18,0);
        $775 = HEAP32[$0>>2]|0;
        $776 = $775 & 32;
        $777 = ($776|0)==(0);
        if (!($777)) {
         break;
        }
        $778 = $$2513$i;
        $779 = (($22) - ($778))|0;
        (___fwritex($$2513$i,$779,$0)|0);
       }
      } while(0);
      $780 = $$1263$ ^ 8192;
      _pad($0,32,$$1260,$697,$780);
      $781 = ($697|0)<($$1260|0);
      $$553$i = $781 ? $$1260 : $697;
      $$0470$i = $$553$i;
     } else {
      $388 = $$0235 & 32;
      $389 = ($388|0)!=(0);
      $390 = $389 ? 1231 : 1235;
      $391 = ($$0471$i != $$0471$i) | (0.0 != 0.0);
      $392 = $389 ? 1239 : 1243;
      $$1521$i = $391 ? 0 : $$0520$i;
      $$0510$i = $391 ? $392 : $390;
      $393 = (($$1521$i) + 3)|0;
      _pad($0,32,$$1260,$393,$187);
      $394 = HEAP32[$0>>2]|0;
      $395 = $394 & 32;
      $396 = ($395|0)==(0);
      if ($396) {
       (___fwritex($$0522$i,$$1521$i,$0)|0);
       $$pre$i = HEAP32[$0>>2]|0;
       $398 = $$pre$i;
      } else {
       $398 = $394;
      }
      $397 = $398 & 32;
      $399 = ($397|0)==(0);
      if ($399) {
       (___fwritex($$0510$i,3,$0)|0);
      }
      $400 = $$1263$ ^ 8192;
      _pad($0,32,$$1260,$393,$400);
      $401 = ($393|0)<($$1260|0);
      $402 = $401 ? $$1260 : $393;
      $$0470$i = $402;
     }
    } while(0);
    $$0243 = $$0470$i;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
    continue L1;
    break;
   }
   default: {
    $$2 = $$0321;$$2234 = 0;$$2239 = 1195;$$2251 = $14;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L310: do {
   if ((label|0) == 63) {
    label = 0;
    $218 = $9;
    $219 = $218;
    $220 = HEAP32[$219>>2]|0;
    $221 = (($218) + 4)|0;
    $222 = $221;
    $223 = HEAP32[$222>>2]|0;
    $224 = $$1236 & 32;
    $225 = ($220|0)==(0);
    $226 = ($223|0)==(0);
    $227 = $225 & $226;
    if ($227) {
     $$05$lcssa$i = $14;$248 = 0;$250 = 0;
    } else {
     $$056$i = $14;$229 = $220;$236 = $223;
     while(1) {
      $228 = $229 & 15;
      $230 = (1179 + ($228)|0);
      $231 = HEAP8[$230>>0]|0;
      $232 = $231&255;
      $233 = $232 | $224;
      $234 = $233&255;
      $235 = ((($$056$i)) + -1|0);
      HEAP8[$235>>0] = $234;
      $237 = (_bitshift64Lshr(($229|0),($236|0),4)|0);
      $238 = tempRet0;
      $239 = ($237|0)==(0);
      $240 = ($238|0)==(0);
      $241 = $239 & $240;
      if ($241) {
       break;
      } else {
       $$056$i = $235;$229 = $237;$236 = $238;
      }
     }
     $242 = $9;
     $243 = $242;
     $244 = HEAP32[$243>>2]|0;
     $245 = (($242) + 4)|0;
     $246 = $245;
     $247 = HEAP32[$246>>2]|0;
     $$05$lcssa$i = $235;$248 = $244;$250 = $247;
    }
    $249 = ($248|0)==(0);
    $251 = ($250|0)==(0);
    $252 = $249 & $251;
    $253 = $$3265 & 8;
    $254 = ($253|0)==(0);
    $or$cond282 = $254 | $252;
    $255 = $$1236 >> 4;
    $256 = (1195 + ($255)|0);
    $$332 = $or$cond282 ? 1195 : $256;
    $$333 = $or$cond282 ? 0 : 2;
    $$0228 = $$05$lcssa$i;$$1233 = $$333;$$1238 = $$332;$$2256 = $$1255;$$4266 = $$3265;
    label = 76;
   }
   else if ((label|0) == 75) {
    label = 0;
    $302 = (_fmt_u($300,$301,$14)|0);
    $$0228 = $302;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;
    label = 76;
   }
   else if ((label|0) == 81) {
    label = 0;
    $334 = (_memchr($$1,0,$$0254)|0);
    $335 = ($334|0)==(0|0);
    $336 = $334;
    $337 = $$1;
    $338 = (($336) - ($337))|0;
    $339 = (($$1) + ($$0254)|0);
    $$3257 = $335 ? $$0254 : $338;
    $$1250 = $335 ? $339 : $334;
    $$2 = $$1;$$2234 = 0;$$2239 = 1195;$$2251 = $$1250;$$5 = $$3257;$$6268 = $187;
   }
   else if ((label|0) == 85) {
    label = 0;
    $$0229396 = $809;$$0240395 = 0;$$1244394 = 0;
    while(1) {
     $347 = HEAP32[$$0229396>>2]|0;
     $348 = ($347|0)==(0);
     if ($348) {
      $$0240$lcssa = $$0240395;$$2245 = $$1244394;
      break;
     }
     $349 = (_wctomb($12,$347)|0);
     $350 = ($349|0)<(0);
     $351 = (($$4258458) - ($$0240395))|0;
     $352 = ($349>>>0)>($351>>>0);
     $or$cond285 = $350 | $352;
     if ($or$cond285) {
      $$0240$lcssa = $$0240395;$$2245 = $349;
      break;
     }
     $353 = ((($$0229396)) + 4|0);
     $354 = (($349) + ($$0240395))|0;
     $355 = ($$4258458>>>0)>($354>>>0);
     if ($355) {
      $$0229396 = $353;$$0240395 = $354;$$1244394 = $349;
     } else {
      $$0240$lcssa = $354;$$2245 = $349;
      break;
     }
    }
    $356 = ($$2245|0)<(0);
    if ($356) {
     $$0 = -1;
     break L1;
    }
    _pad($0,32,$$1260,$$0240$lcssa,$$1263$);
    $357 = ($$0240$lcssa|0)==(0);
    if ($357) {
     $$0240$lcssa460 = 0;
     label = 96;
    } else {
     $$1230407 = $809;$$1241406 = 0;
     while(1) {
      $358 = HEAP32[$$1230407>>2]|0;
      $359 = ($358|0)==(0);
      if ($359) {
       $$0240$lcssa460 = $$0240$lcssa;
       label = 96;
       break L310;
      }
      $360 = ((($$1230407)) + 4|0);
      $361 = (_wctomb($12,$358)|0);
      $362 = (($361) + ($$1241406))|0;
      $363 = ($362|0)>($$0240$lcssa|0);
      if ($363) {
       $$0240$lcssa460 = $$0240$lcssa;
       label = 96;
       break L310;
      }
      $364 = HEAP32[$0>>2]|0;
      $365 = $364 & 32;
      $366 = ($365|0)==(0);
      if ($366) {
       (___fwritex($12,$361,$0)|0);
      }
      $367 = ($362>>>0)<($$0240$lcssa>>>0);
      if ($367) {
       $$1230407 = $360;$$1241406 = $362;
      } else {
       $$0240$lcssa460 = $$0240$lcssa;
       label = 96;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 96) {
   label = 0;
   $368 = $$1263$ ^ 8192;
   _pad($0,32,$$1260,$$0240$lcssa460,$368);
   $369 = ($$1260|0)>($$0240$lcssa460|0);
   $370 = $369 ? $$1260 : $$0240$lcssa460;
   $$0243 = $370;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
   continue;
  }
  if ((label|0) == 76) {
   label = 0;
   $303 = ($$2256|0)>(-1);
   $304 = $$4266 & -65537;
   $$$4266 = $303 ? $304 : $$4266;
   $305 = $9;
   $306 = $305;
   $307 = HEAP32[$306>>2]|0;
   $308 = (($305) + 4)|0;
   $309 = $308;
   $310 = HEAP32[$309>>2]|0;
   $311 = ($307|0)!=(0);
   $312 = ($310|0)!=(0);
   $313 = $311 | $312;
   $314 = ($$2256|0)!=(0);
   $or$cond = $314 | $313;
   if ($or$cond) {
    $315 = $$0228;
    $316 = (($15) - ($315))|0;
    $317 = $313&1;
    $318 = $317 ^ 1;
    $319 = (($318) + ($316))|0;
    $320 = ($$2256|0)>($319|0);
    $$2256$ = $320 ? $$2256 : $319;
    $$2 = $$0228;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $14;$$5 = $$2256$;$$6268 = $$$4266;
   } else {
    $$2 = $14;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $14;$$5 = 0;$$6268 = $$$4266;
   }
  }
  $782 = $$2251;
  $783 = $$2;
  $784 = (($782) - ($783))|0;
  $785 = ($$5|0)<($784|0);
  $$$5 = $785 ? $784 : $$5;
  $786 = (($$$5) + ($$2234))|0;
  $787 = ($$1260|0)<($786|0);
  $$2261 = $787 ? $786 : $$1260;
  _pad($0,32,$$2261,$786,$$6268);
  $788 = HEAP32[$0>>2]|0;
  $789 = $788 & 32;
  $790 = ($789|0)==(0);
  if ($790) {
   (___fwritex($$2239,$$2234,$0)|0);
  }
  $791 = $$6268 ^ 65536;
  _pad($0,48,$$2261,$786,$791);
  _pad($0,48,$$$5,$784,0);
  $792 = HEAP32[$0>>2]|0;
  $793 = $792 & 32;
  $794 = ($793|0)==(0);
  if ($794) {
   (___fwritex($$2,$784,$0)|0);
  }
  $795 = $$6268 ^ 8192;
  _pad($0,32,$$2261,$786,$795);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;$$0321 = $158;
 }
 L345: do {
  if ((label|0) == 243) {
   $796 = ($0|0)==(0|0);
   if ($796) {
    $797 = ($$0269|0)==(0);
    if ($797) {
     $$0 = 0;
    } else {
     $$2242381 = 1;
     while(1) {
      $798 = (($4) + ($$2242381<<2)|0);
      $799 = HEAP32[$798>>2]|0;
      $800 = ($799|0)==(0);
      if ($800) {
       $$3379 = $$2242381;
       break;
      }
      $801 = (($3) + ($$2242381<<3)|0);
      _pop_arg_257($801,$799,$2);
      $802 = (($$2242381) + 1)|0;
      $803 = ($802|0)<(10);
      if ($803) {
       $$2242381 = $802;
      } else {
       $$0 = 1;
       break L345;
      }
     }
     while(1) {
      $806 = (($4) + ($$3379<<2)|0);
      $807 = HEAP32[$806>>2]|0;
      $808 = ($807|0)==(0);
      $804 = (($$3379) + 1)|0;
      if (!($808)) {
       $$0 = -1;
       break L345;
      }
      $805 = ($804|0)<(10);
      if ($805) {
       $$3379 = $804;
      } else {
       $$0 = 1;
       break;
      }
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$032 = 0, $$033 = 0, $$034 = 0, $$1 = 0, $$pre = 0, $$pre38 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$032 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 63]($2,$0,$1)|0);
    $$032 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$0 = $1;
     while(1) {
      $21 = ($$0|0)==(0);
      if ($21) {
       $$033 = $1;$$034 = $0;$$1 = 0;$32 = $14;
       break L10;
      }
      $22 = (($$0) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$0 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 63]($2,$0,$$0)|0);
     $29 = ($28>>>0)<($$0>>>0);
     if ($29) {
      $$032 = $$0;
      break L5;
     }
     $30 = (($0) + ($$0)|0);
     $31 = (($1) - ($$0))|0;
     $$pre38 = HEAP32[$9>>2]|0;
     $$033 = $31;$$034 = $30;$$1 = $$0;$32 = $$pre38;
    } else {
     $$033 = $1;$$034 = $0;$$1 = 0;$32 = $14;
    }
   } while(0);
   _memcpy(($32|0),($$034|0),($$033|0))|0;
   $33 = HEAP32[$9>>2]|0;
   $34 = (($33) + ($$033)|0);
   HEAP32[$9>>2] = $34;
   $35 = (($$1) + ($$033))|0;
   $$032 = $35;
  }
 } while(0);
 return ($$032|0);
}
function _pop_arg_257($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10 | 48;
   $13 = $12&255;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $$011$lcssa = 0, $$01113 = 0, $$015 = 0, $$112 = 0, $$114 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $$015 = 0;
 while(1) {
  $2 = (1249 + ($$015)|0);
  $3 = HEAP8[$2>>0]|0;
  $4 = $3&255;
  $5 = ($4|0)==($0|0);
  if ($5) {
   label = 2;
   break;
  }
  $6 = (($$015) + 1)|0;
  $7 = ($6|0)==(87);
  if ($7) {
   $$01113 = 1337;$$114 = 87;
   label = 5;
   break;
  } else {
   $$015 = $6;
  }
 }
 if ((label|0) == 2) {
  $1 = ($$015|0)==(0);
  if ($1) {
   $$011$lcssa = 1337;
  } else {
   $$01113 = 1337;$$114 = $$015;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$112 = $$01113;
   while(1) {
    $8 = HEAP8[$$112>>0]|0;
    $9 = ($8<<24>>24)==(0);
    $10 = ((($$112)) + 1|0);
    if ($9) {
     break;
    } else {
     $$112 = $10;
    }
   }
   $11 = (($$114) + -1)|0;
   $12 = ($11|0)==(0);
   if ($12) {
    $$011$lcssa = $10;
    break;
   } else {
    $$01113 = $10;$$114 = $11;
    label = 5;
   }
  }
 }
 return ($$011$lcssa|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function _pad($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa16 = 0, $$012 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 do {
  if ($or$cond) {
   $9 = (($2) - ($3))|0;
   $10 = ($9>>>0)>(256);
   $11 = $10 ? 256 : $9;
   _memset(($5|0),($1|0),($11|0))|0;
   $12 = ($9>>>0)>(255);
   $13 = HEAP32[$0>>2]|0;
   $14 = $13 & 32;
   $15 = ($14|0)==(0);
   if ($12) {
    $16 = (($2) - ($3))|0;
    $$012 = $9;$23 = $13;$24 = $15;
    while(1) {
     if ($24) {
      (___fwritex($5,256,$0)|0);
      $$pre = HEAP32[$0>>2]|0;
      $20 = $$pre;
     } else {
      $20 = $23;
     }
     $17 = (($$012) + -256)|0;
     $18 = ($17>>>0)>(255);
     $19 = $20 & 32;
     $21 = ($19|0)==(0);
     if ($18) {
      $$012 = $17;$23 = $20;$24 = $21;
     } else {
      break;
     }
    }
    $22 = $16 & 255;
    if ($21) {
     $$0$lcssa16 = $22;
    } else {
     break;
    }
   } else {
    if ($15) {
     $$0$lcssa16 = $9;
    } else {
     break;
    }
   }
   (___fwritex($5,$$0$lcssa16,$0)|0);
  }
 } while(0);
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = ($1>>>0)<(2048);
   if ($6) {
    $7 = $1 >>> 6;
    $8 = $7 | 192;
    $9 = $8&255;
    $10 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $9;
    $11 = $1 & 63;
    $12 = $11 | 128;
    $13 = $12&255;
    HEAP8[$10>>0] = $13;
    $$0 = 2;
    break;
   }
   $14 = ($1>>>0)<(55296);
   $15 = $1 & -8192;
   $16 = ($15|0)==(57344);
   $or$cond = $14 | $16;
   if ($or$cond) {
    $17 = $1 >>> 12;
    $18 = $17 | 224;
    $19 = $18&255;
    $20 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $19;
    $21 = $1 >>> 6;
    $22 = $21 & 63;
    $23 = $22 | 128;
    $24 = $23&255;
    $25 = ((($0)) + 2|0);
    HEAP8[$20>>0] = $24;
    $26 = $1 & 63;
    $27 = $26 | 128;
    $28 = $27&255;
    HEAP8[$25>>0] = $28;
    $$0 = 3;
    break;
   }
   $29 = (($1) + -65536)|0;
   $30 = ($29>>>0)<(1048576);
   if ($30) {
    $31 = $1 >>> 18;
    $32 = $31 | 240;
    $33 = $32&255;
    $34 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $33;
    $35 = $1 >>> 12;
    $36 = $35 & 63;
    $37 = $36 | 128;
    $38 = $37&255;
    $39 = ((($0)) + 2|0);
    HEAP8[$34>>0] = $38;
    $40 = $1 >>> 6;
    $41 = $40 & 63;
    $42 = $41 | 128;
    $43 = $42&255;
    $44 = ((($0)) + 3|0);
    HEAP8[$39>>0] = $43;
    $45 = $1 & 63;
    $46 = $45 | 128;
    $47 = $46&255;
    HEAP8[$44>>0] = $47;
    $$0 = 4;
    break;
   } else {
    $48 = (___errno_location()|0);
    HEAP32[$48>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = $14;
  $18 = ((($0)) + 48|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = (($17) + ($19)|0);
  $21 = ((($0)) + 16|0);
  HEAP32[$21>>2] = $20;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function _sn_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$cast = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ((($0)) + 20|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (($4) - ($6))|0;
 $8 = ($7>>>0)>($2>>>0);
 $$ = $8 ? $2 : $7;
 $$cast = $6;
 _memcpy(($$cast|0),($1|0),($$|0))|0;
 $9 = HEAP32[$5>>2]|0;
 $10 = (($9) + ($$)|0);
 HEAP32[$5>>2] = $10;
 return ($2|0);
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[66]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $28 = 0;
   } else {
    $10 = HEAP32[66]|0;
    $11 = (_fflush($10)|0);
    $28 = $11;
   }
   ___lock(((9912)|0));
   $$02325 = HEAP32[(9908)>>2]|0;
   $12 = ($$02325|0)==(0|0);
   if ($12) {
    $$024$lcssa = $28;
   } else {
    $$02327 = $$02325;$$02426 = $28;
    while(1) {
     $13 = ((($$02327)) + 76|0);
     $14 = HEAP32[$13>>2]|0;
     $15 = ($14|0)>(-1);
     if ($15) {
      $16 = (___lockfile($$02327)|0);
      $24 = $16;
     } else {
      $24 = 0;
     }
     $17 = ((($$02327)) + 20|0);
     $18 = HEAP32[$17>>2]|0;
     $19 = ((($$02327)) + 28|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($18>>>0)>($20>>>0);
     if ($21) {
      $22 = (___fflush_unlocked($$02327)|0);
      $23 = $22 | $$02426;
      $$1 = $23;
     } else {
      $$1 = $$02426;
     }
     $25 = ($24|0)==(0);
     if (!($25)) {
      ___unlockfile($$02327);
     }
     $26 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$26>>2]|0;
     $27 = ($$023|0)==(0|0);
     if ($27) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___unlock(((9912)|0));
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 63]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = ((($0)) + 40|0);
   $16 = HEAP32[$15>>2]|0;
   $17 = $11;
   $18 = $13;
   $19 = (($17) - ($18))|0;
   (FUNCTION_TABLE_iiii[$16 & 63]($0,$19,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _log10($0) {
 $0 = +$0;
 var $$0 = 0, $$0100 = 0, $$0101 = 0.0, $1 = 0, $10 = 0.0, $11 = 0.0, $12 = 0.0, $13 = 0.0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0.0, $27 = 0, $28 = 0.0, $29 = 0.0, $3 = 0, $30 = 0.0, $31 = 0.0, $32 = 0.0, $33 = 0.0, $34 = 0.0, $35 = 0.0, $36 = 0.0, $37 = 0.0, $38 = 0.0, $39 = 0.0, $4 = 0, $40 = 0.0, $41 = 0.0, $42 = 0.0;
 var $43 = 0.0, $44 = 0.0, $45 = 0.0, $46 = 0.0, $47 = 0.0, $48 = 0.0, $49 = 0, $5 = 0, $50 = 0, $51 = 0.0, $52 = 0.0, $53 = 0.0, $54 = 0.0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0, $60 = 0.0;
 var $61 = 0.0, $62 = 0.0, $63 = 0.0, $64 = 0.0, $65 = 0.0, $66 = 0.0, $67 = 0.0, $68 = 0.0, $69 = 0.0, $7 = 0, $70 = 0.0, $71 = 0, $8 = 0, $9 = 0.0, $or$cond = 0, $or$cond105 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 $3 = ($2>>>0)<(1048576);
 $4 = ($2|0)<(0);
 $or$cond = $4 | $3;
 do {
  if ($or$cond) {
   $5 = $2 & 2147483647;
   $6 = ($1|0)==(0);
   $7 = ($5|0)==(0);
   $8 = $6 & $7;
   if ($8) {
    $9 = $0 * $0;
    $10 = -1.0 / $9;
    $$0101 = $10;
    break;
   }
   if ($4) {
    $11 = $0 - $0;
    $12 = $11 / 0.0;
    $$0101 = $12;
    break;
   } else {
    $13 = $0 * 18014398509481984.0;
    HEAPF64[tempDoublePtr>>3] = $13;$14 = HEAP32[tempDoublePtr>>2]|0;
    $15 = HEAP32[tempDoublePtr+4>>2]|0;
    $$0 = -1077;$$0100 = $15;$27 = $14;$71 = $15;
    label = 9;
    break;
   }
  } else {
   $16 = ($2>>>0)>(2146435071);
   if ($16) {
    $$0101 = $0;
   } else {
    $17 = ($2|0)==(1072693248);
    $18 = ($1|0)==(0);
    $19 = (0)==(0);
    $20 = $18 & $19;
    $or$cond105 = $20 & $17;
    if ($or$cond105) {
     $$0101 = 0.0;
    } else {
     $$0 = -1023;$$0100 = $2;$27 = $1;$71 = $2;
     label = 9;
    }
   }
  }
 } while(0);
 if ((label|0) == 9) {
  $21 = (($$0100) + 614242)|0;
  $22 = $21 >>> 20;
  $23 = (($$0) + ($22))|0;
  $24 = $21 & 1048575;
  $25 = (($24) + 1072079006)|0;
  HEAP32[tempDoublePtr>>2] = $27;HEAP32[tempDoublePtr+4>>2] = $25;$26 = +HEAPF64[tempDoublePtr>>3];
  $28 = $26 + -1.0;
  $29 = $28 * 0.5;
  $30 = $28 * $29;
  $31 = $28 + 2.0;
  $32 = $28 / $31;
  $33 = $32 * $32;
  $34 = $33 * $33;
  $35 = $34 * 0.15313837699209373;
  $36 = $35 + 0.22222198432149784;
  $37 = $34 * $36;
  $38 = $37 + 0.39999999999409419;
  $39 = $34 * $38;
  $40 = $34 * 0.14798198605116586;
  $41 = $40 + 0.1818357216161805;
  $42 = $34 * $41;
  $43 = $42 + 0.28571428743662391;
  $44 = $34 * $43;
  $45 = $44 + 0.66666666666667351;
  $46 = $33 * $45;
  $47 = $39 + $46;
  $48 = $28 - $30;
  HEAPF64[tempDoublePtr>>3] = $48;$49 = HEAP32[tempDoublePtr>>2]|0;
  $50 = HEAP32[tempDoublePtr+4>>2]|0;
  HEAP32[tempDoublePtr>>2] = 0;HEAP32[tempDoublePtr+4>>2] = $50;$51 = +HEAPF64[tempDoublePtr>>3];
  $52 = $28 - $51;
  $53 = $52 - $30;
  $54 = $30 + $47;
  $55 = $32 * $54;
  $56 = $53 + $55;
  $57 = $51 * 0.43429448187816888;
  $58 = (+($23|0));
  $59 = $58 * 0.30102999566361177;
  $60 = $58 * 3.6942390771589308E-13;
  $61 = $51 + $56;
  $62 = $61 * 2.5082946711645275E-11;
  $63 = $60 + $62;
  $64 = $56 * 0.43429448187816888;
  $65 = $64 + $63;
  $66 = $59 + $57;
  $67 = $59 - $66;
  $68 = $57 + $67;
  $69 = $68 + $65;
  $70 = $66 + $69;
  $$0101 = $70;
 }
 return (+$$0101);
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 63]($0,$2,1)|0);
   $22 = ($21|0)==(1);
   if ($22) {
    $23 = HEAP8[$2>>0]|0;
    $24 = $23&255;
    $$0 = $24;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _fputc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)<(0);
 if ($4) {
  label = 3;
 } else {
  $5 = (___lockfile($1)|0);
  $6 = ($5|0)==(0);
  if ($6) {
   label = 3;
  } else {
   $20 = ((($1)) + 75|0);
   $21 = HEAP8[$20>>0]|0;
   $22 = $21 << 24 >> 24;
   $23 = ($22|0)==($0|0);
   if ($23) {
    label = 10;
   } else {
    $24 = ((($1)) + 20|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = ((($1)) + 16|0);
    $27 = HEAP32[$26>>2]|0;
    $28 = ($25>>>0)<($27>>>0);
    if ($28) {
     $29 = $0&255;
     $30 = ((($25)) + 1|0);
     HEAP32[$24>>2] = $30;
     HEAP8[$25>>0] = $29;
     $31 = $0 & 255;
     $33 = $31;
    } else {
     label = 10;
    }
   }
   if ((label|0) == 10) {
    $32 = (___overflow($1,$0)|0);
    $33 = $32;
   }
   ___unlockfile($1);
   $$0 = $33;
  }
 }
 do {
  if ((label|0) == 3) {
   $7 = ((($1)) + 75|0);
   $8 = HEAP8[$7>>0]|0;
   $9 = $8 << 24 >> 24;
   $10 = ($9|0)==($0|0);
   if (!($10)) {
    $11 = ((($1)) + 20|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ((($1)) + 16|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($12>>>0)<($14>>>0);
    if ($15) {
     $16 = $0&255;
     $17 = ((($12)) + 1|0);
     HEAP32[$11>>2] = $17;
     HEAP8[$12>>0] = $16;
     $18 = $0 & 255;
     $$0 = $18;
     break;
    }
   }
   $19 = (___overflow($1,$0)|0);
   $$0 = $19;
  }
 } while(0);
 return ($$0|0);
}
function _sprintf($0,$1,$varargs) {
 $0 = $0|0;
 $1 = $1|0;
 $varargs = $varargs|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 HEAP32[$2>>2] = $varargs;
 $3 = (_vsprintf($0,$1,$2)|0);
 STACKTOP = sp;return ($3|0);
}
function _vsprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (_vsnprintf($0,2147483647,$1,$2)|0);
 return ($3|0);
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0190$i = 0, $$$0191$i = 0, $$$4349$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0$i18$i = 0, $$01$i$i = 0, $$0187$i = 0, $$0189$i = 0, $$0190$i = 0, $$0191$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0;
 var $$024370$i = 0, $$0286$i$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0294$i$i = 0, $$0295$i$i = 0, $$0340$i = 0, $$0342$i = 0, $$0343$i = 0, $$0345$i = 0, $$0351$i = 0, $$0356$i = 0, $$0357$$i = 0, $$0357$i = 0, $$0359$i = 0, $$0360$i = 0, $$0366$i = 0, $$1194$i = 0, $$1196$i = 0, $$124469$i = 0;
 var $$1290$i$i = 0, $$1292$i$i = 0, $$1341$i = 0, $$1346$i = 0, $$1361$i = 0, $$1368$i = 0, $$1372$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2353$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i201 = 0, $$3348$i = 0, $$3370$i = 0, $$4$lcssa$i = 0, $$413$i = 0, $$4349$lcssa$i = 0, $$434912$i = 0, $$4355$$4$i = 0;
 var $$4355$ph$i = 0, $$435511$i = 0, $$5256$i = 0, $$723947$i = 0, $$748$i = 0, $$not$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i19$i = 0, $$pre$i205 = 0, $$pre$i208 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i20$iZ2D = 0, $$pre$phi$i206Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi10$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre9$i$i = 0, $1 = 0;
 var $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0;
 var $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0;
 var $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0;
 var $1053 = 0, $1054 = 0, $1055 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0;
 var $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0;
 var $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0;
 var $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0;
 var $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0;
 var $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0;
 var $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0;
 var $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0;
 var $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0;
 var $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0;
 var $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0;
 var $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0;
 var $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0;
 var $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0;
 var $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0;
 var $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0;
 var $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0;
 var $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0;
 var $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0;
 var $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0;
 var $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0;
 var $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0;
 var $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0;
 var $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0;
 var $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0;
 var $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0;
 var $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0;
 var $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0;
 var $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0;
 var $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0;
 var $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0;
 var $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0;
 var $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0;
 var $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0;
 var $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0;
 var $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0;
 var $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0;
 var $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0;
 var $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0;
 var $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0;
 var $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0;
 var $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0;
 var $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0;
 var $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0;
 var $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0;
 var $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0;
 var $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0;
 var $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0;
 var $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0;
 var $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i204 = 0, $exitcond$i$i = 0, $not$$i$i = 0, $not$$i22$i = 0;
 var $not$7$i = 0, $or$cond$i = 0, $or$cond$i211 = 0, $or$cond1$i = 0, $or$cond1$i210 = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond12$i = 0, $or$cond2$i = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond7$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[2483]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (9972 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($16|0)==($20|0);
    do {
     if ($21) {
      $22 = 1 << $14;
      $23 = $22 ^ -1;
      $24 = $8 & $23;
      HEAP32[2483] = $24;
     } else {
      $25 = HEAP32[(9948)>>2]|0;
      $26 = ($20>>>0)<($25>>>0);
      if ($26) {
       _abort();
       // unreachable;
      }
      $27 = ((($20)) + 12|0);
      $28 = HEAP32[$27>>2]|0;
      $29 = ($28|0)==($18|0);
      if ($29) {
       HEAP32[$27>>2] = $16;
       HEAP32[$17>>2] = $20;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $30 = $14 << 3;
    $31 = $30 | 3;
    $32 = ((($18)) + 4|0);
    HEAP32[$32>>2] = $31;
    $33 = (($18) + ($30)|0);
    $34 = ((($33)) + 4|0);
    $35 = HEAP32[$34>>2]|0;
    $36 = $35 | 1;
    HEAP32[$34>>2] = $36;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $37 = HEAP32[(9940)>>2]|0;
   $38 = ($6>>>0)>($37>>>0);
   if ($38) {
    $39 = ($9|0)==(0);
    if (!($39)) {
     $40 = $9 << $7;
     $41 = 2 << $7;
     $42 = (0 - ($41))|0;
     $43 = $41 | $42;
     $44 = $40 & $43;
     $45 = (0 - ($44))|0;
     $46 = $44 & $45;
     $47 = (($46) + -1)|0;
     $48 = $47 >>> 12;
     $49 = $48 & 16;
     $50 = $47 >>> $49;
     $51 = $50 >>> 5;
     $52 = $51 & 8;
     $53 = $52 | $49;
     $54 = $50 >>> $52;
     $55 = $54 >>> 2;
     $56 = $55 & 4;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 2;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = $62 >>> 1;
     $64 = $63 & 1;
     $65 = $61 | $64;
     $66 = $62 >>> $64;
     $67 = (($65) + ($66))|0;
     $68 = $67 << 1;
     $69 = (9972 + ($68<<2)|0);
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ((($71)) + 8|0);
     $73 = HEAP32[$72>>2]|0;
     $74 = ($69|0)==($73|0);
     do {
      if ($74) {
       $75 = 1 << $67;
       $76 = $75 ^ -1;
       $77 = $8 & $76;
       HEAP32[2483] = $77;
       $98 = $77;
      } else {
       $78 = HEAP32[(9948)>>2]|0;
       $79 = ($73>>>0)<($78>>>0);
       if ($79) {
        _abort();
        // unreachable;
       }
       $80 = ((($73)) + 12|0);
       $81 = HEAP32[$80>>2]|0;
       $82 = ($81|0)==($71|0);
       if ($82) {
        HEAP32[$80>>2] = $69;
        HEAP32[$70>>2] = $73;
        $98 = $8;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $83 = $67 << 3;
     $84 = (($83) - ($6))|0;
     $85 = $6 | 3;
     $86 = ((($71)) + 4|0);
     HEAP32[$86>>2] = $85;
     $87 = (($71) + ($6)|0);
     $88 = $84 | 1;
     $89 = ((($87)) + 4|0);
     HEAP32[$89>>2] = $88;
     $90 = (($87) + ($84)|0);
     HEAP32[$90>>2] = $84;
     $91 = ($37|0)==(0);
     if (!($91)) {
      $92 = HEAP32[(9952)>>2]|0;
      $93 = $37 >>> 3;
      $94 = $93 << 1;
      $95 = (9972 + ($94<<2)|0);
      $96 = 1 << $93;
      $97 = $98 & $96;
      $99 = ($97|0)==(0);
      if ($99) {
       $100 = $98 | $96;
       HEAP32[2483] = $100;
       $$pre = ((($95)) + 8|0);
       $$0199 = $95;$$pre$phiZ2D = $$pre;
      } else {
       $101 = ((($95)) + 8|0);
       $102 = HEAP32[$101>>2]|0;
       $103 = HEAP32[(9948)>>2]|0;
       $104 = ($102>>>0)<($103>>>0);
       if ($104) {
        _abort();
        // unreachable;
       } else {
        $$0199 = $102;$$pre$phiZ2D = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $92;
      $105 = ((($$0199)) + 12|0);
      HEAP32[$105>>2] = $92;
      $106 = ((($92)) + 8|0);
      HEAP32[$106>>2] = $$0199;
      $107 = ((($92)) + 12|0);
      HEAP32[$107>>2] = $95;
     }
     HEAP32[(9940)>>2] = $84;
     HEAP32[(9952)>>2] = $87;
     $$0 = $72;
     STACKTOP = sp;return ($$0|0);
    }
    $108 = HEAP32[(9936)>>2]|0;
    $109 = ($108|0)==(0);
    if ($109) {
     $$0197 = $6;
    } else {
     $110 = (0 - ($108))|0;
     $111 = $108 & $110;
     $112 = (($111) + -1)|0;
     $113 = $112 >>> 12;
     $114 = $113 & 16;
     $115 = $112 >>> $114;
     $116 = $115 >>> 5;
     $117 = $116 & 8;
     $118 = $117 | $114;
     $119 = $115 >>> $117;
     $120 = $119 >>> 2;
     $121 = $120 & 4;
     $122 = $118 | $121;
     $123 = $119 >>> $121;
     $124 = $123 >>> 1;
     $125 = $124 & 2;
     $126 = $122 | $125;
     $127 = $123 >>> $125;
     $128 = $127 >>> 1;
     $129 = $128 & 1;
     $130 = $126 | $129;
     $131 = $127 >>> $129;
     $132 = (($130) + ($131))|0;
     $133 = (10236 + ($132<<2)|0);
     $134 = HEAP32[$133>>2]|0;
     $135 = ((($134)) + 4|0);
     $136 = HEAP32[$135>>2]|0;
     $137 = $136 & -8;
     $138 = (($137) - ($6))|0;
     $$0189$i = $134;$$0190$i = $134;$$0191$i = $138;
     while(1) {
      $139 = ((($$0189$i)) + 16|0);
      $140 = HEAP32[$139>>2]|0;
      $141 = ($140|0)==(0|0);
      if ($141) {
       $142 = ((($$0189$i)) + 20|0);
       $143 = HEAP32[$142>>2]|0;
       $144 = ($143|0)==(0|0);
       if ($144) {
        break;
       } else {
        $146 = $143;
       }
      } else {
       $146 = $140;
      }
      $145 = ((($146)) + 4|0);
      $147 = HEAP32[$145>>2]|0;
      $148 = $147 & -8;
      $149 = (($148) - ($6))|0;
      $150 = ($149>>>0)<($$0191$i>>>0);
      $$$0191$i = $150 ? $149 : $$0191$i;
      $$$0190$i = $150 ? $146 : $$0190$i;
      $$0189$i = $146;$$0190$i = $$$0190$i;$$0191$i = $$$0191$i;
     }
     $151 = HEAP32[(9948)>>2]|0;
     $152 = ($$0190$i>>>0)<($151>>>0);
     if ($152) {
      _abort();
      // unreachable;
     }
     $153 = (($$0190$i) + ($6)|0);
     $154 = ($$0190$i>>>0)<($153>>>0);
     if (!($154)) {
      _abort();
      // unreachable;
     }
     $155 = ((($$0190$i)) + 24|0);
     $156 = HEAP32[$155>>2]|0;
     $157 = ((($$0190$i)) + 12|0);
     $158 = HEAP32[$157>>2]|0;
     $159 = ($158|0)==($$0190$i|0);
     do {
      if ($159) {
       $169 = ((($$0190$i)) + 20|0);
       $170 = HEAP32[$169>>2]|0;
       $171 = ($170|0)==(0|0);
       if ($171) {
        $172 = ((($$0190$i)) + 16|0);
        $173 = HEAP32[$172>>2]|0;
        $174 = ($173|0)==(0|0);
        if ($174) {
         $$3$i = 0;
         break;
        } else {
         $$1194$i = $173;$$1196$i = $172;
        }
       } else {
        $$1194$i = $170;$$1196$i = $169;
       }
       while(1) {
        $175 = ((($$1194$i)) + 20|0);
        $176 = HEAP32[$175>>2]|0;
        $177 = ($176|0)==(0|0);
        if (!($177)) {
         $$1194$i = $176;$$1196$i = $175;
         continue;
        }
        $178 = ((($$1194$i)) + 16|0);
        $179 = HEAP32[$178>>2]|0;
        $180 = ($179|0)==(0|0);
        if ($180) {
         break;
        } else {
         $$1194$i = $179;$$1196$i = $178;
        }
       }
       $181 = ($$1196$i>>>0)<($151>>>0);
       if ($181) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$$1196$i>>2] = 0;
        $$3$i = $$1194$i;
        break;
       }
      } else {
       $160 = ((($$0190$i)) + 8|0);
       $161 = HEAP32[$160>>2]|0;
       $162 = ($161>>>0)<($151>>>0);
       if ($162) {
        _abort();
        // unreachable;
       }
       $163 = ((($161)) + 12|0);
       $164 = HEAP32[$163>>2]|0;
       $165 = ($164|0)==($$0190$i|0);
       if (!($165)) {
        _abort();
        // unreachable;
       }
       $166 = ((($158)) + 8|0);
       $167 = HEAP32[$166>>2]|0;
       $168 = ($167|0)==($$0190$i|0);
       if ($168) {
        HEAP32[$163>>2] = $158;
        HEAP32[$166>>2] = $161;
        $$3$i = $158;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $182 = ($156|0)==(0|0);
     do {
      if (!($182)) {
       $183 = ((($$0190$i)) + 28|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = (10236 + ($184<<2)|0);
       $186 = HEAP32[$185>>2]|0;
       $187 = ($$0190$i|0)==($186|0);
       if ($187) {
        HEAP32[$185>>2] = $$3$i;
        $cond$i = ($$3$i|0)==(0|0);
        if ($cond$i) {
         $188 = 1 << $184;
         $189 = $188 ^ -1;
         $190 = $108 & $189;
         HEAP32[(9936)>>2] = $190;
         break;
        }
       } else {
        $191 = HEAP32[(9948)>>2]|0;
        $192 = ($156>>>0)<($191>>>0);
        if ($192) {
         _abort();
         // unreachable;
        }
        $193 = ((($156)) + 16|0);
        $194 = HEAP32[$193>>2]|0;
        $195 = ($194|0)==($$0190$i|0);
        if ($195) {
         HEAP32[$193>>2] = $$3$i;
        } else {
         $196 = ((($156)) + 20|0);
         HEAP32[$196>>2] = $$3$i;
        }
        $197 = ($$3$i|0)==(0|0);
        if ($197) {
         break;
        }
       }
       $198 = HEAP32[(9948)>>2]|0;
       $199 = ($$3$i>>>0)<($198>>>0);
       if ($199) {
        _abort();
        // unreachable;
       }
       $200 = ((($$3$i)) + 24|0);
       HEAP32[$200>>2] = $156;
       $201 = ((($$0190$i)) + 16|0);
       $202 = HEAP32[$201>>2]|0;
       $203 = ($202|0)==(0|0);
       do {
        if (!($203)) {
         $204 = ($202>>>0)<($198>>>0);
         if ($204) {
          _abort();
          // unreachable;
         } else {
          $205 = ((($$3$i)) + 16|0);
          HEAP32[$205>>2] = $202;
          $206 = ((($202)) + 24|0);
          HEAP32[$206>>2] = $$3$i;
          break;
         }
        }
       } while(0);
       $207 = ((($$0190$i)) + 20|0);
       $208 = HEAP32[$207>>2]|0;
       $209 = ($208|0)==(0|0);
       if (!($209)) {
        $210 = HEAP32[(9948)>>2]|0;
        $211 = ($208>>>0)<($210>>>0);
        if ($211) {
         _abort();
         // unreachable;
        } else {
         $212 = ((($$3$i)) + 20|0);
         HEAP32[$212>>2] = $208;
         $213 = ((($208)) + 24|0);
         HEAP32[$213>>2] = $$3$i;
         break;
        }
       }
      }
     } while(0);
     $214 = ($$0191$i>>>0)<(16);
     if ($214) {
      $215 = (($$0191$i) + ($6))|0;
      $216 = $215 | 3;
      $217 = ((($$0190$i)) + 4|0);
      HEAP32[$217>>2] = $216;
      $218 = (($$0190$i) + ($215)|0);
      $219 = ((($218)) + 4|0);
      $220 = HEAP32[$219>>2]|0;
      $221 = $220 | 1;
      HEAP32[$219>>2] = $221;
     } else {
      $222 = $6 | 3;
      $223 = ((($$0190$i)) + 4|0);
      HEAP32[$223>>2] = $222;
      $224 = $$0191$i | 1;
      $225 = ((($153)) + 4|0);
      HEAP32[$225>>2] = $224;
      $226 = (($153) + ($$0191$i)|0);
      HEAP32[$226>>2] = $$0191$i;
      $227 = ($37|0)==(0);
      if (!($227)) {
       $228 = HEAP32[(9952)>>2]|0;
       $229 = $37 >>> 3;
       $230 = $229 << 1;
       $231 = (9972 + ($230<<2)|0);
       $232 = 1 << $229;
       $233 = $8 & $232;
       $234 = ($233|0)==(0);
       if ($234) {
        $235 = $8 | $232;
        HEAP32[2483] = $235;
        $$pre$i = ((($231)) + 8|0);
        $$0187$i = $231;$$pre$phi$iZ2D = $$pre$i;
       } else {
        $236 = ((($231)) + 8|0);
        $237 = HEAP32[$236>>2]|0;
        $238 = HEAP32[(9948)>>2]|0;
        $239 = ($237>>>0)<($238>>>0);
        if ($239) {
         _abort();
         // unreachable;
        } else {
         $$0187$i = $237;$$pre$phi$iZ2D = $236;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $228;
       $240 = ((($$0187$i)) + 12|0);
       HEAP32[$240>>2] = $228;
       $241 = ((($228)) + 8|0);
       HEAP32[$241>>2] = $$0187$i;
       $242 = ((($228)) + 12|0);
       HEAP32[$242>>2] = $231;
      }
      HEAP32[(9940)>>2] = $$0191$i;
      HEAP32[(9952)>>2] = $153;
     }
     $243 = ((($$0190$i)) + 8|0);
     $$0 = $243;
     STACKTOP = sp;return ($$0|0);
    }
   } else {
    $$0197 = $6;
   }
  } else {
   $244 = ($0>>>0)>(4294967231);
   if ($244) {
    $$0197 = -1;
   } else {
    $245 = (($0) + 11)|0;
    $246 = $245 & -8;
    $247 = HEAP32[(9936)>>2]|0;
    $248 = ($247|0)==(0);
    if ($248) {
     $$0197 = $246;
    } else {
     $249 = (0 - ($246))|0;
     $250 = $245 >>> 8;
     $251 = ($250|0)==(0);
     if ($251) {
      $$0356$i = 0;
     } else {
      $252 = ($246>>>0)>(16777215);
      if ($252) {
       $$0356$i = 31;
      } else {
       $253 = (($250) + 1048320)|0;
       $254 = $253 >>> 16;
       $255 = $254 & 8;
       $256 = $250 << $255;
       $257 = (($256) + 520192)|0;
       $258 = $257 >>> 16;
       $259 = $258 & 4;
       $260 = $259 | $255;
       $261 = $256 << $259;
       $262 = (($261) + 245760)|0;
       $263 = $262 >>> 16;
       $264 = $263 & 2;
       $265 = $260 | $264;
       $266 = (14 - ($265))|0;
       $267 = $261 << $264;
       $268 = $267 >>> 15;
       $269 = (($266) + ($268))|0;
       $270 = $269 << 1;
       $271 = (($269) + 7)|0;
       $272 = $246 >>> $271;
       $273 = $272 & 1;
       $274 = $273 | $270;
       $$0356$i = $274;
      }
     }
     $275 = (10236 + ($$0356$i<<2)|0);
     $276 = HEAP32[$275>>2]|0;
     $277 = ($276|0)==(0|0);
     L123: do {
      if ($277) {
       $$2353$i = 0;$$3$i201 = 0;$$3348$i = $249;
       label = 86;
      } else {
       $278 = ($$0356$i|0)==(31);
       $279 = $$0356$i >>> 1;
       $280 = (25 - ($279))|0;
       $281 = $278 ? 0 : $280;
       $282 = $246 << $281;
       $$0340$i = 0;$$0345$i = $249;$$0351$i = $276;$$0357$i = $282;$$0360$i = 0;
       while(1) {
        $283 = ((($$0351$i)) + 4|0);
        $284 = HEAP32[$283>>2]|0;
        $285 = $284 & -8;
        $286 = (($285) - ($246))|0;
        $287 = ($286>>>0)<($$0345$i>>>0);
        if ($287) {
         $288 = ($286|0)==(0);
         if ($288) {
          $$413$i = $$0351$i;$$434912$i = 0;$$435511$i = $$0351$i;
          label = 90;
          break L123;
         } else {
          $$1341$i = $$0351$i;$$1346$i = $286;
         }
        } else {
         $$1341$i = $$0340$i;$$1346$i = $$0345$i;
        }
        $289 = ((($$0351$i)) + 20|0);
        $290 = HEAP32[$289>>2]|0;
        $291 = $$0357$i >>> 31;
        $292 = (((($$0351$i)) + 16|0) + ($291<<2)|0);
        $293 = HEAP32[$292>>2]|0;
        $294 = ($290|0)==(0|0);
        $295 = ($290|0)==($293|0);
        $or$cond1$i = $294 | $295;
        $$1361$i = $or$cond1$i ? $$0360$i : $290;
        $296 = ($293|0)==(0|0);
        $297 = $296&1;
        $298 = $297 ^ 1;
        $$0357$$i = $$0357$i << $298;
        if ($296) {
         $$2353$i = $$1361$i;$$3$i201 = $$1341$i;$$3348$i = $$1346$i;
         label = 86;
         break;
        } else {
         $$0340$i = $$1341$i;$$0345$i = $$1346$i;$$0351$i = $293;$$0357$i = $$0357$$i;$$0360$i = $$1361$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 86) {
      $299 = ($$2353$i|0)==(0|0);
      $300 = ($$3$i201|0)==(0|0);
      $or$cond$i = $299 & $300;
      if ($or$cond$i) {
       $301 = 2 << $$0356$i;
       $302 = (0 - ($301))|0;
       $303 = $301 | $302;
       $304 = $247 & $303;
       $305 = ($304|0)==(0);
       if ($305) {
        $$0197 = $246;
        break;
       }
       $306 = (0 - ($304))|0;
       $307 = $304 & $306;
       $308 = (($307) + -1)|0;
       $309 = $308 >>> 12;
       $310 = $309 & 16;
       $311 = $308 >>> $310;
       $312 = $311 >>> 5;
       $313 = $312 & 8;
       $314 = $313 | $310;
       $315 = $311 >>> $313;
       $316 = $315 >>> 2;
       $317 = $316 & 4;
       $318 = $314 | $317;
       $319 = $315 >>> $317;
       $320 = $319 >>> 1;
       $321 = $320 & 2;
       $322 = $318 | $321;
       $323 = $319 >>> $321;
       $324 = $323 >>> 1;
       $325 = $324 & 1;
       $326 = $322 | $325;
       $327 = $323 >>> $325;
       $328 = (($326) + ($327))|0;
       $329 = (10236 + ($328<<2)|0);
       $330 = HEAP32[$329>>2]|0;
       $$4355$ph$i = $330;
      } else {
       $$4355$ph$i = $$2353$i;
      }
      $331 = ($$4355$ph$i|0)==(0|0);
      if ($331) {
       $$4$lcssa$i = $$3$i201;$$4349$lcssa$i = $$3348$i;
      } else {
       $$413$i = $$3$i201;$$434912$i = $$3348$i;$$435511$i = $$4355$ph$i;
       label = 90;
      }
     }
     if ((label|0) == 90) {
      while(1) {
       label = 0;
       $332 = ((($$435511$i)) + 4|0);
       $333 = HEAP32[$332>>2]|0;
       $334 = $333 & -8;
       $335 = (($334) - ($246))|0;
       $336 = ($335>>>0)<($$434912$i>>>0);
       $$$4349$i = $336 ? $335 : $$434912$i;
       $$4355$$4$i = $336 ? $$435511$i : $$413$i;
       $337 = ((($$435511$i)) + 16|0);
       $338 = HEAP32[$337>>2]|0;
       $339 = ($338|0)==(0|0);
       if (!($339)) {
        $$413$i = $$4355$$4$i;$$434912$i = $$$4349$i;$$435511$i = $338;
        label = 90;
        continue;
       }
       $340 = ((($$435511$i)) + 20|0);
       $341 = HEAP32[$340>>2]|0;
       $342 = ($341|0)==(0|0);
       if ($342) {
        $$4$lcssa$i = $$4355$$4$i;$$4349$lcssa$i = $$$4349$i;
        break;
       } else {
        $$413$i = $$4355$$4$i;$$434912$i = $$$4349$i;$$435511$i = $341;
        label = 90;
       }
      }
     }
     $343 = ($$4$lcssa$i|0)==(0|0);
     if ($343) {
      $$0197 = $246;
     } else {
      $344 = HEAP32[(9940)>>2]|0;
      $345 = (($344) - ($246))|0;
      $346 = ($$4349$lcssa$i>>>0)<($345>>>0);
      if ($346) {
       $347 = HEAP32[(9948)>>2]|0;
       $348 = ($$4$lcssa$i>>>0)<($347>>>0);
       if ($348) {
        _abort();
        // unreachable;
       }
       $349 = (($$4$lcssa$i) + ($246)|0);
       $350 = ($$4$lcssa$i>>>0)<($349>>>0);
       if (!($350)) {
        _abort();
        // unreachable;
       }
       $351 = ((($$4$lcssa$i)) + 24|0);
       $352 = HEAP32[$351>>2]|0;
       $353 = ((($$4$lcssa$i)) + 12|0);
       $354 = HEAP32[$353>>2]|0;
       $355 = ($354|0)==($$4$lcssa$i|0);
       do {
        if ($355) {
         $365 = ((($$4$lcssa$i)) + 20|0);
         $366 = HEAP32[$365>>2]|0;
         $367 = ($366|0)==(0|0);
         if ($367) {
          $368 = ((($$4$lcssa$i)) + 16|0);
          $369 = HEAP32[$368>>2]|0;
          $370 = ($369|0)==(0|0);
          if ($370) {
           $$3370$i = 0;
           break;
          } else {
           $$1368$i = $369;$$1372$i = $368;
          }
         } else {
          $$1368$i = $366;$$1372$i = $365;
         }
         while(1) {
          $371 = ((($$1368$i)) + 20|0);
          $372 = HEAP32[$371>>2]|0;
          $373 = ($372|0)==(0|0);
          if (!($373)) {
           $$1368$i = $372;$$1372$i = $371;
           continue;
          }
          $374 = ((($$1368$i)) + 16|0);
          $375 = HEAP32[$374>>2]|0;
          $376 = ($375|0)==(0|0);
          if ($376) {
           break;
          } else {
           $$1368$i = $375;$$1372$i = $374;
          }
         }
         $377 = ($$1372$i>>>0)<($347>>>0);
         if ($377) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$1372$i>>2] = 0;
          $$3370$i = $$1368$i;
          break;
         }
        } else {
         $356 = ((($$4$lcssa$i)) + 8|0);
         $357 = HEAP32[$356>>2]|0;
         $358 = ($357>>>0)<($347>>>0);
         if ($358) {
          _abort();
          // unreachable;
         }
         $359 = ((($357)) + 12|0);
         $360 = HEAP32[$359>>2]|0;
         $361 = ($360|0)==($$4$lcssa$i|0);
         if (!($361)) {
          _abort();
          // unreachable;
         }
         $362 = ((($354)) + 8|0);
         $363 = HEAP32[$362>>2]|0;
         $364 = ($363|0)==($$4$lcssa$i|0);
         if ($364) {
          HEAP32[$359>>2] = $354;
          HEAP32[$362>>2] = $357;
          $$3370$i = $354;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $378 = ($352|0)==(0|0);
       do {
        if ($378) {
         $470 = $247;
        } else {
         $379 = ((($$4$lcssa$i)) + 28|0);
         $380 = HEAP32[$379>>2]|0;
         $381 = (10236 + ($380<<2)|0);
         $382 = HEAP32[$381>>2]|0;
         $383 = ($$4$lcssa$i|0)==($382|0);
         if ($383) {
          HEAP32[$381>>2] = $$3370$i;
          $cond$i204 = ($$3370$i|0)==(0|0);
          if ($cond$i204) {
           $384 = 1 << $380;
           $385 = $384 ^ -1;
           $386 = $247 & $385;
           HEAP32[(9936)>>2] = $386;
           $470 = $386;
           break;
          }
         } else {
          $387 = HEAP32[(9948)>>2]|0;
          $388 = ($352>>>0)<($387>>>0);
          if ($388) {
           _abort();
           // unreachable;
          }
          $389 = ((($352)) + 16|0);
          $390 = HEAP32[$389>>2]|0;
          $391 = ($390|0)==($$4$lcssa$i|0);
          if ($391) {
           HEAP32[$389>>2] = $$3370$i;
          } else {
           $392 = ((($352)) + 20|0);
           HEAP32[$392>>2] = $$3370$i;
          }
          $393 = ($$3370$i|0)==(0|0);
          if ($393) {
           $470 = $247;
           break;
          }
         }
         $394 = HEAP32[(9948)>>2]|0;
         $395 = ($$3370$i>>>0)<($394>>>0);
         if ($395) {
          _abort();
          // unreachable;
         }
         $396 = ((($$3370$i)) + 24|0);
         HEAP32[$396>>2] = $352;
         $397 = ((($$4$lcssa$i)) + 16|0);
         $398 = HEAP32[$397>>2]|0;
         $399 = ($398|0)==(0|0);
         do {
          if (!($399)) {
           $400 = ($398>>>0)<($394>>>0);
           if ($400) {
            _abort();
            // unreachable;
           } else {
            $401 = ((($$3370$i)) + 16|0);
            HEAP32[$401>>2] = $398;
            $402 = ((($398)) + 24|0);
            HEAP32[$402>>2] = $$3370$i;
            break;
           }
          }
         } while(0);
         $403 = ((($$4$lcssa$i)) + 20|0);
         $404 = HEAP32[$403>>2]|0;
         $405 = ($404|0)==(0|0);
         if ($405) {
          $470 = $247;
         } else {
          $406 = HEAP32[(9948)>>2]|0;
          $407 = ($404>>>0)<($406>>>0);
          if ($407) {
           _abort();
           // unreachable;
          } else {
           $408 = ((($$3370$i)) + 20|0);
           HEAP32[$408>>2] = $404;
           $409 = ((($404)) + 24|0);
           HEAP32[$409>>2] = $$3370$i;
           $470 = $247;
           break;
          }
         }
        }
       } while(0);
       $410 = ($$4349$lcssa$i>>>0)<(16);
       do {
        if ($410) {
         $411 = (($$4349$lcssa$i) + ($246))|0;
         $412 = $411 | 3;
         $413 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$413>>2] = $412;
         $414 = (($$4$lcssa$i) + ($411)|0);
         $415 = ((($414)) + 4|0);
         $416 = HEAP32[$415>>2]|0;
         $417 = $416 | 1;
         HEAP32[$415>>2] = $417;
        } else {
         $418 = $246 | 3;
         $419 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$419>>2] = $418;
         $420 = $$4349$lcssa$i | 1;
         $421 = ((($349)) + 4|0);
         HEAP32[$421>>2] = $420;
         $422 = (($349) + ($$4349$lcssa$i)|0);
         HEAP32[$422>>2] = $$4349$lcssa$i;
         $423 = $$4349$lcssa$i >>> 3;
         $424 = ($$4349$lcssa$i>>>0)<(256);
         if ($424) {
          $425 = $423 << 1;
          $426 = (9972 + ($425<<2)|0);
          $427 = HEAP32[2483]|0;
          $428 = 1 << $423;
          $429 = $427 & $428;
          $430 = ($429|0)==(0);
          if ($430) {
           $431 = $427 | $428;
           HEAP32[2483] = $431;
           $$pre$i205 = ((($426)) + 8|0);
           $$0366$i = $426;$$pre$phi$i206Z2D = $$pre$i205;
          } else {
           $432 = ((($426)) + 8|0);
           $433 = HEAP32[$432>>2]|0;
           $434 = HEAP32[(9948)>>2]|0;
           $435 = ($433>>>0)<($434>>>0);
           if ($435) {
            _abort();
            // unreachable;
           } else {
            $$0366$i = $433;$$pre$phi$i206Z2D = $432;
           }
          }
          HEAP32[$$pre$phi$i206Z2D>>2] = $349;
          $436 = ((($$0366$i)) + 12|0);
          HEAP32[$436>>2] = $349;
          $437 = ((($349)) + 8|0);
          HEAP32[$437>>2] = $$0366$i;
          $438 = ((($349)) + 12|0);
          HEAP32[$438>>2] = $426;
          break;
         }
         $439 = $$4349$lcssa$i >>> 8;
         $440 = ($439|0)==(0);
         if ($440) {
          $$0359$i = 0;
         } else {
          $441 = ($$4349$lcssa$i>>>0)>(16777215);
          if ($441) {
           $$0359$i = 31;
          } else {
           $442 = (($439) + 1048320)|0;
           $443 = $442 >>> 16;
           $444 = $443 & 8;
           $445 = $439 << $444;
           $446 = (($445) + 520192)|0;
           $447 = $446 >>> 16;
           $448 = $447 & 4;
           $449 = $448 | $444;
           $450 = $445 << $448;
           $451 = (($450) + 245760)|0;
           $452 = $451 >>> 16;
           $453 = $452 & 2;
           $454 = $449 | $453;
           $455 = (14 - ($454))|0;
           $456 = $450 << $453;
           $457 = $456 >>> 15;
           $458 = (($455) + ($457))|0;
           $459 = $458 << 1;
           $460 = (($458) + 7)|0;
           $461 = $$4349$lcssa$i >>> $460;
           $462 = $461 & 1;
           $463 = $462 | $459;
           $$0359$i = $463;
          }
         }
         $464 = (10236 + ($$0359$i<<2)|0);
         $465 = ((($349)) + 28|0);
         HEAP32[$465>>2] = $$0359$i;
         $466 = ((($349)) + 16|0);
         $467 = ((($466)) + 4|0);
         HEAP32[$467>>2] = 0;
         HEAP32[$466>>2] = 0;
         $468 = 1 << $$0359$i;
         $469 = $470 & $468;
         $471 = ($469|0)==(0);
         if ($471) {
          $472 = $470 | $468;
          HEAP32[(9936)>>2] = $472;
          HEAP32[$464>>2] = $349;
          $473 = ((($349)) + 24|0);
          HEAP32[$473>>2] = $464;
          $474 = ((($349)) + 12|0);
          HEAP32[$474>>2] = $349;
          $475 = ((($349)) + 8|0);
          HEAP32[$475>>2] = $349;
          break;
         }
         $476 = HEAP32[$464>>2]|0;
         $477 = ($$0359$i|0)==(31);
         $478 = $$0359$i >>> 1;
         $479 = (25 - ($478))|0;
         $480 = $477 ? 0 : $479;
         $481 = $$4349$lcssa$i << $480;
         $$0342$i = $481;$$0343$i = $476;
         while(1) {
          $482 = ((($$0343$i)) + 4|0);
          $483 = HEAP32[$482>>2]|0;
          $484 = $483 & -8;
          $485 = ($484|0)==($$4349$lcssa$i|0);
          if ($485) {
           label = 148;
           break;
          }
          $486 = $$0342$i >>> 31;
          $487 = (((($$0343$i)) + 16|0) + ($486<<2)|0);
          $488 = $$0342$i << 1;
          $489 = HEAP32[$487>>2]|0;
          $490 = ($489|0)==(0|0);
          if ($490) {
           label = 145;
           break;
          } else {
           $$0342$i = $488;$$0343$i = $489;
          }
         }
         if ((label|0) == 145) {
          $491 = HEAP32[(9948)>>2]|0;
          $492 = ($487>>>0)<($491>>>0);
          if ($492) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$487>>2] = $349;
           $493 = ((($349)) + 24|0);
           HEAP32[$493>>2] = $$0343$i;
           $494 = ((($349)) + 12|0);
           HEAP32[$494>>2] = $349;
           $495 = ((($349)) + 8|0);
           HEAP32[$495>>2] = $349;
           break;
          }
         }
         else if ((label|0) == 148) {
          $496 = ((($$0343$i)) + 8|0);
          $497 = HEAP32[$496>>2]|0;
          $498 = HEAP32[(9948)>>2]|0;
          $499 = ($497>>>0)>=($498>>>0);
          $not$7$i = ($$0343$i>>>0)>=($498>>>0);
          $500 = $499 & $not$7$i;
          if ($500) {
           $501 = ((($497)) + 12|0);
           HEAP32[$501>>2] = $349;
           HEAP32[$496>>2] = $349;
           $502 = ((($349)) + 8|0);
           HEAP32[$502>>2] = $497;
           $503 = ((($349)) + 12|0);
           HEAP32[$503>>2] = $$0343$i;
           $504 = ((($349)) + 24|0);
           HEAP32[$504>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $505 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $505;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0197 = $246;
      }
     }
    }
   }
  }
 } while(0);
 $506 = HEAP32[(9940)>>2]|0;
 $507 = ($506>>>0)<($$0197>>>0);
 if (!($507)) {
  $508 = (($506) - ($$0197))|0;
  $509 = HEAP32[(9952)>>2]|0;
  $510 = ($508>>>0)>(15);
  if ($510) {
   $511 = (($509) + ($$0197)|0);
   HEAP32[(9952)>>2] = $511;
   HEAP32[(9940)>>2] = $508;
   $512 = $508 | 1;
   $513 = ((($511)) + 4|0);
   HEAP32[$513>>2] = $512;
   $514 = (($511) + ($508)|0);
   HEAP32[$514>>2] = $508;
   $515 = $$0197 | 3;
   $516 = ((($509)) + 4|0);
   HEAP32[$516>>2] = $515;
  } else {
   HEAP32[(9940)>>2] = 0;
   HEAP32[(9952)>>2] = 0;
   $517 = $506 | 3;
   $518 = ((($509)) + 4|0);
   HEAP32[$518>>2] = $517;
   $519 = (($509) + ($506)|0);
   $520 = ((($519)) + 4|0);
   $521 = HEAP32[$520>>2]|0;
   $522 = $521 | 1;
   HEAP32[$520>>2] = $522;
  }
  $523 = ((($509)) + 8|0);
  $$0 = $523;
  STACKTOP = sp;return ($$0|0);
 }
 $524 = HEAP32[(9944)>>2]|0;
 $525 = ($524>>>0)>($$0197>>>0);
 if ($525) {
  $526 = (($524) - ($$0197))|0;
  HEAP32[(9944)>>2] = $526;
  $527 = HEAP32[(9956)>>2]|0;
  $528 = (($527) + ($$0197)|0);
  HEAP32[(9956)>>2] = $528;
  $529 = $526 | 1;
  $530 = ((($528)) + 4|0);
  HEAP32[$530>>2] = $529;
  $531 = $$0197 | 3;
  $532 = ((($527)) + 4|0);
  HEAP32[$532>>2] = $531;
  $533 = ((($527)) + 8|0);
  $$0 = $533;
  STACKTOP = sp;return ($$0|0);
 }
 $534 = HEAP32[2601]|0;
 $535 = ($534|0)==(0);
 if ($535) {
  HEAP32[(10412)>>2] = 4096;
  HEAP32[(10408)>>2] = 4096;
  HEAP32[(10416)>>2] = -1;
  HEAP32[(10420)>>2] = -1;
  HEAP32[(10424)>>2] = 0;
  HEAP32[(10376)>>2] = 0;
  $536 = $1;
  $537 = $536 & -16;
  $538 = $537 ^ 1431655768;
  HEAP32[$1>>2] = $538;
  HEAP32[2601] = $538;
  $542 = 4096;
 } else {
  $$pre$i208 = HEAP32[(10412)>>2]|0;
  $542 = $$pre$i208;
 }
 $539 = (($$0197) + 48)|0;
 $540 = (($$0197) + 47)|0;
 $541 = (($542) + ($540))|0;
 $543 = (0 - ($542))|0;
 $544 = $541 & $543;
 $545 = ($544>>>0)>($$0197>>>0);
 if (!($545)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $546 = HEAP32[(10372)>>2]|0;
 $547 = ($546|0)==(0);
 if (!($547)) {
  $548 = HEAP32[(10364)>>2]|0;
  $549 = (($548) + ($544))|0;
  $550 = ($549>>>0)<=($548>>>0);
  $551 = ($549>>>0)>($546>>>0);
  $or$cond1$i210 = $550 | $551;
  if ($or$cond1$i210) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $552 = HEAP32[(10376)>>2]|0;
 $553 = $552 & 4;
 $554 = ($553|0)==(0);
 L255: do {
  if ($554) {
   $555 = HEAP32[(9956)>>2]|0;
   $556 = ($555|0)==(0|0);
   L257: do {
    if ($556) {
     label = 172;
    } else {
     $$0$i17$i = (10380);
     while(1) {
      $557 = HEAP32[$$0$i17$i>>2]|0;
      $558 = ($557>>>0)>($555>>>0);
      if (!($558)) {
       $559 = ((($$0$i17$i)) + 4|0);
       $560 = HEAP32[$559>>2]|0;
       $561 = (($557) + ($560)|0);
       $562 = ($561>>>0)>($555>>>0);
       if ($562) {
        break;
       }
      }
      $563 = ((($$0$i17$i)) + 8|0);
      $564 = HEAP32[$563>>2]|0;
      $565 = ($564|0)==(0|0);
      if ($565) {
       label = 172;
       break L257;
      } else {
       $$0$i17$i = $564;
      }
     }
     $588 = (($541) - ($524))|0;
     $589 = $588 & $543;
     $590 = ($589>>>0)<(2147483647);
     if ($590) {
      $591 = (_sbrk(($589|0))|0);
      $592 = HEAP32[$$0$i17$i>>2]|0;
      $593 = HEAP32[$559>>2]|0;
      $594 = (($592) + ($593)|0);
      $595 = ($591|0)==($594|0);
      if ($595) {
       $596 = ($591|0)==((-1)|0);
       if (!($596)) {
        $$723947$i = $589;$$748$i = $591;
        label = 190;
        break L255;
       }
      } else {
       $$2247$ph$i = $591;$$2253$ph$i = $589;
       label = 180;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 172) {
     $566 = (_sbrk(0)|0);
     $567 = ($566|0)==((-1)|0);
     if (!($567)) {
      $568 = $566;
      $569 = HEAP32[(10408)>>2]|0;
      $570 = (($569) + -1)|0;
      $571 = $570 & $568;
      $572 = ($571|0)==(0);
      $573 = (($570) + ($568))|0;
      $574 = (0 - ($569))|0;
      $575 = $573 & $574;
      $576 = (($575) - ($568))|0;
      $577 = $572 ? 0 : $576;
      $$$i = (($577) + ($544))|0;
      $578 = HEAP32[(10364)>>2]|0;
      $579 = (($$$i) + ($578))|0;
      $580 = ($$$i>>>0)>($$0197>>>0);
      $581 = ($$$i>>>0)<(2147483647);
      $or$cond$i211 = $580 & $581;
      if ($or$cond$i211) {
       $582 = HEAP32[(10372)>>2]|0;
       $583 = ($582|0)==(0);
       if (!($583)) {
        $584 = ($579>>>0)<=($578>>>0);
        $585 = ($579>>>0)>($582>>>0);
        $or$cond2$i = $584 | $585;
        if ($or$cond2$i) {
         break;
        }
       }
       $586 = (_sbrk(($$$i|0))|0);
       $587 = ($586|0)==($566|0);
       if ($587) {
        $$723947$i = $$$i;$$748$i = $566;
        label = 190;
        break L255;
       } else {
        $$2247$ph$i = $586;$$2253$ph$i = $$$i;
        label = 180;
       }
      }
     }
    }
   } while(0);
   L274: do {
    if ((label|0) == 180) {
     $597 = (0 - ($$2253$ph$i))|0;
     $598 = ($$2247$ph$i|0)!=((-1)|0);
     $599 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $599 & $598;
     $600 = ($539>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $600 & $or$cond7$i;
     do {
      if ($or$cond10$i) {
       $601 = HEAP32[(10412)>>2]|0;
       $602 = (($540) - ($$2253$ph$i))|0;
       $603 = (($602) + ($601))|0;
       $604 = (0 - ($601))|0;
       $605 = $603 & $604;
       $606 = ($605>>>0)<(2147483647);
       if ($606) {
        $607 = (_sbrk(($605|0))|0);
        $608 = ($607|0)==((-1)|0);
        if ($608) {
         (_sbrk(($597|0))|0);
         break L274;
        } else {
         $609 = (($605) + ($$2253$ph$i))|0;
         $$5256$i = $609;
         break;
        }
       } else {
        $$5256$i = $$2253$ph$i;
       }
      } else {
       $$5256$i = $$2253$ph$i;
      }
     } while(0);
     $610 = ($$2247$ph$i|0)==((-1)|0);
     if (!($610)) {
      $$723947$i = $$5256$i;$$748$i = $$2247$ph$i;
      label = 190;
      break L255;
     }
    }
   } while(0);
   $611 = HEAP32[(10376)>>2]|0;
   $612 = $611 | 4;
   HEAP32[(10376)>>2] = $612;
   label = 187;
  } else {
   label = 187;
  }
 } while(0);
 if ((label|0) == 187) {
  $613 = ($544>>>0)<(2147483647);
  if ($613) {
   $614 = (_sbrk(($544|0))|0);
   $615 = (_sbrk(0)|0);
   $616 = ($614|0)!=((-1)|0);
   $617 = ($615|0)!=((-1)|0);
   $or$cond5$i = $616 & $617;
   $618 = ($614>>>0)<($615>>>0);
   $or$cond11$i = $618 & $or$cond5$i;
   if ($or$cond11$i) {
    $619 = $615;
    $620 = $614;
    $621 = (($619) - ($620))|0;
    $622 = (($$0197) + 40)|0;
    $$not$i = ($621>>>0)>($622>>>0);
    if ($$not$i) {
     $$723947$i = $621;$$748$i = $614;
     label = 190;
    }
   }
  }
 }
 if ((label|0) == 190) {
  $623 = HEAP32[(10364)>>2]|0;
  $624 = (($623) + ($$723947$i))|0;
  HEAP32[(10364)>>2] = $624;
  $625 = HEAP32[(10368)>>2]|0;
  $626 = ($624>>>0)>($625>>>0);
  if ($626) {
   HEAP32[(10368)>>2] = $624;
  }
  $627 = HEAP32[(9956)>>2]|0;
  $628 = ($627|0)==(0|0);
  do {
   if ($628) {
    $629 = HEAP32[(9948)>>2]|0;
    $630 = ($629|0)==(0|0);
    $631 = ($$748$i>>>0)<($629>>>0);
    $or$cond12$i = $630 | $631;
    if ($or$cond12$i) {
     HEAP32[(9948)>>2] = $$748$i;
    }
    HEAP32[(10380)>>2] = $$748$i;
    HEAP32[(10384)>>2] = $$723947$i;
    HEAP32[(10392)>>2] = 0;
    $632 = HEAP32[2601]|0;
    HEAP32[(9968)>>2] = $632;
    HEAP32[(9964)>>2] = -1;
    $$01$i$i = 0;
    while(1) {
     $633 = $$01$i$i << 1;
     $634 = (9972 + ($633<<2)|0);
     $635 = ((($634)) + 12|0);
     HEAP32[$635>>2] = $634;
     $636 = ((($634)) + 8|0);
     HEAP32[$636>>2] = $634;
     $637 = (($$01$i$i) + 1)|0;
     $exitcond$i$i = ($637|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $$01$i$i = $637;
     }
    }
    $638 = (($$723947$i) + -40)|0;
    $639 = ((($$748$i)) + 8|0);
    $640 = $639;
    $641 = $640 & 7;
    $642 = ($641|0)==(0);
    $643 = (0 - ($640))|0;
    $644 = $643 & 7;
    $645 = $642 ? 0 : $644;
    $646 = (($$748$i) + ($645)|0);
    $647 = (($638) - ($645))|0;
    HEAP32[(9956)>>2] = $646;
    HEAP32[(9944)>>2] = $647;
    $648 = $647 | 1;
    $649 = ((($646)) + 4|0);
    HEAP32[$649>>2] = $648;
    $650 = (($646) + ($647)|0);
    $651 = ((($650)) + 4|0);
    HEAP32[$651>>2] = 40;
    $652 = HEAP32[(10420)>>2]|0;
    HEAP32[(9960)>>2] = $652;
   } else {
    $$024370$i = (10380);
    while(1) {
     $653 = HEAP32[$$024370$i>>2]|0;
     $654 = ((($$024370$i)) + 4|0);
     $655 = HEAP32[$654>>2]|0;
     $656 = (($653) + ($655)|0);
     $657 = ($$748$i|0)==($656|0);
     if ($657) {
      label = 200;
      break;
     }
     $658 = ((($$024370$i)) + 8|0);
     $659 = HEAP32[$658>>2]|0;
     $660 = ($659|0)==(0|0);
     if ($660) {
      break;
     } else {
      $$024370$i = $659;
     }
    }
    if ((label|0) == 200) {
     $661 = ((($$024370$i)) + 12|0);
     $662 = HEAP32[$661>>2]|0;
     $663 = $662 & 8;
     $664 = ($663|0)==(0);
     if ($664) {
      $665 = ($627>>>0)>=($653>>>0);
      $666 = ($627>>>0)<($$748$i>>>0);
      $or$cond50$i = $666 & $665;
      if ($or$cond50$i) {
       $667 = (($655) + ($$723947$i))|0;
       HEAP32[$654>>2] = $667;
       $668 = HEAP32[(9944)>>2]|0;
       $669 = ((($627)) + 8|0);
       $670 = $669;
       $671 = $670 & 7;
       $672 = ($671|0)==(0);
       $673 = (0 - ($670))|0;
       $674 = $673 & 7;
       $675 = $672 ? 0 : $674;
       $676 = (($627) + ($675)|0);
       $677 = (($$723947$i) - ($675))|0;
       $678 = (($677) + ($668))|0;
       HEAP32[(9956)>>2] = $676;
       HEAP32[(9944)>>2] = $678;
       $679 = $678 | 1;
       $680 = ((($676)) + 4|0);
       HEAP32[$680>>2] = $679;
       $681 = (($676) + ($678)|0);
       $682 = ((($681)) + 4|0);
       HEAP32[$682>>2] = 40;
       $683 = HEAP32[(10420)>>2]|0;
       HEAP32[(9960)>>2] = $683;
       break;
      }
     }
    }
    $684 = HEAP32[(9948)>>2]|0;
    $685 = ($$748$i>>>0)<($684>>>0);
    if ($685) {
     HEAP32[(9948)>>2] = $$748$i;
     $749 = $$748$i;
    } else {
     $749 = $684;
    }
    $686 = (($$748$i) + ($$723947$i)|0);
    $$124469$i = (10380);
    while(1) {
     $687 = HEAP32[$$124469$i>>2]|0;
     $688 = ($687|0)==($686|0);
     if ($688) {
      label = 208;
      break;
     }
     $689 = ((($$124469$i)) + 8|0);
     $690 = HEAP32[$689>>2]|0;
     $691 = ($690|0)==(0|0);
     if ($691) {
      $$0$i$i$i = (10380);
      break;
     } else {
      $$124469$i = $690;
     }
    }
    if ((label|0) == 208) {
     $692 = ((($$124469$i)) + 12|0);
     $693 = HEAP32[$692>>2]|0;
     $694 = $693 & 8;
     $695 = ($694|0)==(0);
     if ($695) {
      HEAP32[$$124469$i>>2] = $$748$i;
      $696 = ((($$124469$i)) + 4|0);
      $697 = HEAP32[$696>>2]|0;
      $698 = (($697) + ($$723947$i))|0;
      HEAP32[$696>>2] = $698;
      $699 = ((($$748$i)) + 8|0);
      $700 = $699;
      $701 = $700 & 7;
      $702 = ($701|0)==(0);
      $703 = (0 - ($700))|0;
      $704 = $703 & 7;
      $705 = $702 ? 0 : $704;
      $706 = (($$748$i) + ($705)|0);
      $707 = ((($686)) + 8|0);
      $708 = $707;
      $709 = $708 & 7;
      $710 = ($709|0)==(0);
      $711 = (0 - ($708))|0;
      $712 = $711 & 7;
      $713 = $710 ? 0 : $712;
      $714 = (($686) + ($713)|0);
      $715 = $714;
      $716 = $706;
      $717 = (($715) - ($716))|0;
      $718 = (($706) + ($$0197)|0);
      $719 = (($717) - ($$0197))|0;
      $720 = $$0197 | 3;
      $721 = ((($706)) + 4|0);
      HEAP32[$721>>2] = $720;
      $722 = ($714|0)==($627|0);
      do {
       if ($722) {
        $723 = HEAP32[(9944)>>2]|0;
        $724 = (($723) + ($719))|0;
        HEAP32[(9944)>>2] = $724;
        HEAP32[(9956)>>2] = $718;
        $725 = $724 | 1;
        $726 = ((($718)) + 4|0);
        HEAP32[$726>>2] = $725;
       } else {
        $727 = HEAP32[(9952)>>2]|0;
        $728 = ($714|0)==($727|0);
        if ($728) {
         $729 = HEAP32[(9940)>>2]|0;
         $730 = (($729) + ($719))|0;
         HEAP32[(9940)>>2] = $730;
         HEAP32[(9952)>>2] = $718;
         $731 = $730 | 1;
         $732 = ((($718)) + 4|0);
         HEAP32[$732>>2] = $731;
         $733 = (($718) + ($730)|0);
         HEAP32[$733>>2] = $730;
         break;
        }
        $734 = ((($714)) + 4|0);
        $735 = HEAP32[$734>>2]|0;
        $736 = $735 & 3;
        $737 = ($736|0)==(1);
        if ($737) {
         $738 = $735 & -8;
         $739 = $735 >>> 3;
         $740 = ($735>>>0)<(256);
         L326: do {
          if ($740) {
           $741 = ((($714)) + 8|0);
           $742 = HEAP32[$741>>2]|0;
           $743 = ((($714)) + 12|0);
           $744 = HEAP32[$743>>2]|0;
           $745 = $739 << 1;
           $746 = (9972 + ($745<<2)|0);
           $747 = ($742|0)==($746|0);
           do {
            if (!($747)) {
             $748 = ($742>>>0)<($749>>>0);
             if ($748) {
              _abort();
              // unreachable;
             }
             $750 = ((($742)) + 12|0);
             $751 = HEAP32[$750>>2]|0;
             $752 = ($751|0)==($714|0);
             if ($752) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $753 = ($744|0)==($742|0);
           if ($753) {
            $754 = 1 << $739;
            $755 = $754 ^ -1;
            $756 = HEAP32[2483]|0;
            $757 = $756 & $755;
            HEAP32[2483] = $757;
            break;
           }
           $758 = ($744|0)==($746|0);
           do {
            if ($758) {
             $$pre9$i$i = ((($744)) + 8|0);
             $$pre$phi10$i$iZ2D = $$pre9$i$i;
            } else {
             $759 = ($744>>>0)<($749>>>0);
             if ($759) {
              _abort();
              // unreachable;
             }
             $760 = ((($744)) + 8|0);
             $761 = HEAP32[$760>>2]|0;
             $762 = ($761|0)==($714|0);
             if ($762) {
              $$pre$phi10$i$iZ2D = $760;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $763 = ((($742)) + 12|0);
           HEAP32[$763>>2] = $744;
           HEAP32[$$pre$phi10$i$iZ2D>>2] = $742;
          } else {
           $764 = ((($714)) + 24|0);
           $765 = HEAP32[$764>>2]|0;
           $766 = ((($714)) + 12|0);
           $767 = HEAP32[$766>>2]|0;
           $768 = ($767|0)==($714|0);
           do {
            if ($768) {
             $778 = ((($714)) + 16|0);
             $779 = ((($778)) + 4|0);
             $780 = HEAP32[$779>>2]|0;
             $781 = ($780|0)==(0|0);
             if ($781) {
              $782 = HEAP32[$778>>2]|0;
              $783 = ($782|0)==(0|0);
              if ($783) {
               $$3$i$i = 0;
               break;
              } else {
               $$1290$i$i = $782;$$1292$i$i = $778;
              }
             } else {
              $$1290$i$i = $780;$$1292$i$i = $779;
             }
             while(1) {
              $784 = ((($$1290$i$i)) + 20|0);
              $785 = HEAP32[$784>>2]|0;
              $786 = ($785|0)==(0|0);
              if (!($786)) {
               $$1290$i$i = $785;$$1292$i$i = $784;
               continue;
              }
              $787 = ((($$1290$i$i)) + 16|0);
              $788 = HEAP32[$787>>2]|0;
              $789 = ($788|0)==(0|0);
              if ($789) {
               break;
              } else {
               $$1290$i$i = $788;$$1292$i$i = $787;
              }
             }
             $790 = ($$1292$i$i>>>0)<($749>>>0);
             if ($790) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$$1292$i$i>>2] = 0;
              $$3$i$i = $$1290$i$i;
              break;
             }
            } else {
             $769 = ((($714)) + 8|0);
             $770 = HEAP32[$769>>2]|0;
             $771 = ($770>>>0)<($749>>>0);
             if ($771) {
              _abort();
              // unreachable;
             }
             $772 = ((($770)) + 12|0);
             $773 = HEAP32[$772>>2]|0;
             $774 = ($773|0)==($714|0);
             if (!($774)) {
              _abort();
              // unreachable;
             }
             $775 = ((($767)) + 8|0);
             $776 = HEAP32[$775>>2]|0;
             $777 = ($776|0)==($714|0);
             if ($777) {
              HEAP32[$772>>2] = $767;
              HEAP32[$775>>2] = $770;
              $$3$i$i = $767;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $791 = ($765|0)==(0|0);
           if ($791) {
            break;
           }
           $792 = ((($714)) + 28|0);
           $793 = HEAP32[$792>>2]|0;
           $794 = (10236 + ($793<<2)|0);
           $795 = HEAP32[$794>>2]|0;
           $796 = ($714|0)==($795|0);
           do {
            if ($796) {
             HEAP32[$794>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $797 = 1 << $793;
             $798 = $797 ^ -1;
             $799 = HEAP32[(9936)>>2]|0;
             $800 = $799 & $798;
             HEAP32[(9936)>>2] = $800;
             break L326;
            } else {
             $801 = HEAP32[(9948)>>2]|0;
             $802 = ($765>>>0)<($801>>>0);
             if ($802) {
              _abort();
              // unreachable;
             }
             $803 = ((($765)) + 16|0);
             $804 = HEAP32[$803>>2]|0;
             $805 = ($804|0)==($714|0);
             if ($805) {
              HEAP32[$803>>2] = $$3$i$i;
             } else {
              $806 = ((($765)) + 20|0);
              HEAP32[$806>>2] = $$3$i$i;
             }
             $807 = ($$3$i$i|0)==(0|0);
             if ($807) {
              break L326;
             }
            }
           } while(0);
           $808 = HEAP32[(9948)>>2]|0;
           $809 = ($$3$i$i>>>0)<($808>>>0);
           if ($809) {
            _abort();
            // unreachable;
           }
           $810 = ((($$3$i$i)) + 24|0);
           HEAP32[$810>>2] = $765;
           $811 = ((($714)) + 16|0);
           $812 = HEAP32[$811>>2]|0;
           $813 = ($812|0)==(0|0);
           do {
            if (!($813)) {
             $814 = ($812>>>0)<($808>>>0);
             if ($814) {
              _abort();
              // unreachable;
             } else {
              $815 = ((($$3$i$i)) + 16|0);
              HEAP32[$815>>2] = $812;
              $816 = ((($812)) + 24|0);
              HEAP32[$816>>2] = $$3$i$i;
              break;
             }
            }
           } while(0);
           $817 = ((($811)) + 4|0);
           $818 = HEAP32[$817>>2]|0;
           $819 = ($818|0)==(0|0);
           if ($819) {
            break;
           }
           $820 = HEAP32[(9948)>>2]|0;
           $821 = ($818>>>0)<($820>>>0);
           if ($821) {
            _abort();
            // unreachable;
           } else {
            $822 = ((($$3$i$i)) + 20|0);
            HEAP32[$822>>2] = $818;
            $823 = ((($818)) + 24|0);
            HEAP32[$823>>2] = $$3$i$i;
            break;
           }
          }
         } while(0);
         $824 = (($714) + ($738)|0);
         $825 = (($738) + ($719))|0;
         $$0$i18$i = $824;$$0286$i$i = $825;
        } else {
         $$0$i18$i = $714;$$0286$i$i = $719;
        }
        $826 = ((($$0$i18$i)) + 4|0);
        $827 = HEAP32[$826>>2]|0;
        $828 = $827 & -2;
        HEAP32[$826>>2] = $828;
        $829 = $$0286$i$i | 1;
        $830 = ((($718)) + 4|0);
        HEAP32[$830>>2] = $829;
        $831 = (($718) + ($$0286$i$i)|0);
        HEAP32[$831>>2] = $$0286$i$i;
        $832 = $$0286$i$i >>> 3;
        $833 = ($$0286$i$i>>>0)<(256);
        if ($833) {
         $834 = $832 << 1;
         $835 = (9972 + ($834<<2)|0);
         $836 = HEAP32[2483]|0;
         $837 = 1 << $832;
         $838 = $836 & $837;
         $839 = ($838|0)==(0);
         do {
          if ($839) {
           $840 = $836 | $837;
           HEAP32[2483] = $840;
           $$pre$i19$i = ((($835)) + 8|0);
           $$0294$i$i = $835;$$pre$phi$i20$iZ2D = $$pre$i19$i;
          } else {
           $841 = ((($835)) + 8|0);
           $842 = HEAP32[$841>>2]|0;
           $843 = HEAP32[(9948)>>2]|0;
           $844 = ($842>>>0)<($843>>>0);
           if (!($844)) {
            $$0294$i$i = $842;$$pre$phi$i20$iZ2D = $841;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i20$iZ2D>>2] = $718;
         $845 = ((($$0294$i$i)) + 12|0);
         HEAP32[$845>>2] = $718;
         $846 = ((($718)) + 8|0);
         HEAP32[$846>>2] = $$0294$i$i;
         $847 = ((($718)) + 12|0);
         HEAP32[$847>>2] = $835;
         break;
        }
        $848 = $$0286$i$i >>> 8;
        $849 = ($848|0)==(0);
        do {
         if ($849) {
          $$0295$i$i = 0;
         } else {
          $850 = ($$0286$i$i>>>0)>(16777215);
          if ($850) {
           $$0295$i$i = 31;
           break;
          }
          $851 = (($848) + 1048320)|0;
          $852 = $851 >>> 16;
          $853 = $852 & 8;
          $854 = $848 << $853;
          $855 = (($854) + 520192)|0;
          $856 = $855 >>> 16;
          $857 = $856 & 4;
          $858 = $857 | $853;
          $859 = $854 << $857;
          $860 = (($859) + 245760)|0;
          $861 = $860 >>> 16;
          $862 = $861 & 2;
          $863 = $858 | $862;
          $864 = (14 - ($863))|0;
          $865 = $859 << $862;
          $866 = $865 >>> 15;
          $867 = (($864) + ($866))|0;
          $868 = $867 << 1;
          $869 = (($867) + 7)|0;
          $870 = $$0286$i$i >>> $869;
          $871 = $870 & 1;
          $872 = $871 | $868;
          $$0295$i$i = $872;
         }
        } while(0);
        $873 = (10236 + ($$0295$i$i<<2)|0);
        $874 = ((($718)) + 28|0);
        HEAP32[$874>>2] = $$0295$i$i;
        $875 = ((($718)) + 16|0);
        $876 = ((($875)) + 4|0);
        HEAP32[$876>>2] = 0;
        HEAP32[$875>>2] = 0;
        $877 = HEAP32[(9936)>>2]|0;
        $878 = 1 << $$0295$i$i;
        $879 = $877 & $878;
        $880 = ($879|0)==(0);
        if ($880) {
         $881 = $877 | $878;
         HEAP32[(9936)>>2] = $881;
         HEAP32[$873>>2] = $718;
         $882 = ((($718)) + 24|0);
         HEAP32[$882>>2] = $873;
         $883 = ((($718)) + 12|0);
         HEAP32[$883>>2] = $718;
         $884 = ((($718)) + 8|0);
         HEAP32[$884>>2] = $718;
         break;
        }
        $885 = HEAP32[$873>>2]|0;
        $886 = ($$0295$i$i|0)==(31);
        $887 = $$0295$i$i >>> 1;
        $888 = (25 - ($887))|0;
        $889 = $886 ? 0 : $888;
        $890 = $$0286$i$i << $889;
        $$0287$i$i = $890;$$0288$i$i = $885;
        while(1) {
         $891 = ((($$0288$i$i)) + 4|0);
         $892 = HEAP32[$891>>2]|0;
         $893 = $892 & -8;
         $894 = ($893|0)==($$0286$i$i|0);
         if ($894) {
          label = 278;
          break;
         }
         $895 = $$0287$i$i >>> 31;
         $896 = (((($$0288$i$i)) + 16|0) + ($895<<2)|0);
         $897 = $$0287$i$i << 1;
         $898 = HEAP32[$896>>2]|0;
         $899 = ($898|0)==(0|0);
         if ($899) {
          label = 275;
          break;
         } else {
          $$0287$i$i = $897;$$0288$i$i = $898;
         }
        }
        if ((label|0) == 275) {
         $900 = HEAP32[(9948)>>2]|0;
         $901 = ($896>>>0)<($900>>>0);
         if ($901) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$896>>2] = $718;
          $902 = ((($718)) + 24|0);
          HEAP32[$902>>2] = $$0288$i$i;
          $903 = ((($718)) + 12|0);
          HEAP32[$903>>2] = $718;
          $904 = ((($718)) + 8|0);
          HEAP32[$904>>2] = $718;
          break;
         }
        }
        else if ((label|0) == 278) {
         $905 = ((($$0288$i$i)) + 8|0);
         $906 = HEAP32[$905>>2]|0;
         $907 = HEAP32[(9948)>>2]|0;
         $908 = ($906>>>0)>=($907>>>0);
         $not$$i22$i = ($$0288$i$i>>>0)>=($907>>>0);
         $909 = $908 & $not$$i22$i;
         if ($909) {
          $910 = ((($906)) + 12|0);
          HEAP32[$910>>2] = $718;
          HEAP32[$905>>2] = $718;
          $911 = ((($718)) + 8|0);
          HEAP32[$911>>2] = $906;
          $912 = ((($718)) + 12|0);
          HEAP32[$912>>2] = $$0288$i$i;
          $913 = ((($718)) + 24|0);
          HEAP32[$913>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1044 = ((($706)) + 8|0);
      $$0 = $1044;
      STACKTOP = sp;return ($$0|0);
     } else {
      $$0$i$i$i = (10380);
     }
    }
    while(1) {
     $914 = HEAP32[$$0$i$i$i>>2]|0;
     $915 = ($914>>>0)>($627>>>0);
     if (!($915)) {
      $916 = ((($$0$i$i$i)) + 4|0);
      $917 = HEAP32[$916>>2]|0;
      $918 = (($914) + ($917)|0);
      $919 = ($918>>>0)>($627>>>0);
      if ($919) {
       break;
      }
     }
     $920 = ((($$0$i$i$i)) + 8|0);
     $921 = HEAP32[$920>>2]|0;
     $$0$i$i$i = $921;
    }
    $922 = ((($918)) + -47|0);
    $923 = ((($922)) + 8|0);
    $924 = $923;
    $925 = $924 & 7;
    $926 = ($925|0)==(0);
    $927 = (0 - ($924))|0;
    $928 = $927 & 7;
    $929 = $926 ? 0 : $928;
    $930 = (($922) + ($929)|0);
    $931 = ((($627)) + 16|0);
    $932 = ($930>>>0)<($931>>>0);
    $933 = $932 ? $627 : $930;
    $934 = ((($933)) + 8|0);
    $935 = ((($933)) + 24|0);
    $936 = (($$723947$i) + -40)|0;
    $937 = ((($$748$i)) + 8|0);
    $938 = $937;
    $939 = $938 & 7;
    $940 = ($939|0)==(0);
    $941 = (0 - ($938))|0;
    $942 = $941 & 7;
    $943 = $940 ? 0 : $942;
    $944 = (($$748$i) + ($943)|0);
    $945 = (($936) - ($943))|0;
    HEAP32[(9956)>>2] = $944;
    HEAP32[(9944)>>2] = $945;
    $946 = $945 | 1;
    $947 = ((($944)) + 4|0);
    HEAP32[$947>>2] = $946;
    $948 = (($944) + ($945)|0);
    $949 = ((($948)) + 4|0);
    HEAP32[$949>>2] = 40;
    $950 = HEAP32[(10420)>>2]|0;
    HEAP32[(9960)>>2] = $950;
    $951 = ((($933)) + 4|0);
    HEAP32[$951>>2] = 27;
    ;HEAP32[$934>>2]=HEAP32[(10380)>>2]|0;HEAP32[$934+4>>2]=HEAP32[(10380)+4>>2]|0;HEAP32[$934+8>>2]=HEAP32[(10380)+8>>2]|0;HEAP32[$934+12>>2]=HEAP32[(10380)+12>>2]|0;
    HEAP32[(10380)>>2] = $$748$i;
    HEAP32[(10384)>>2] = $$723947$i;
    HEAP32[(10392)>>2] = 0;
    HEAP32[(10388)>>2] = $934;
    $$0$i$i = $935;
    while(1) {
     $952 = ((($$0$i$i)) + 4|0);
     HEAP32[$952>>2] = 7;
     $953 = ((($952)) + 4|0);
     $954 = ($953>>>0)<($918>>>0);
     if ($954) {
      $$0$i$i = $952;
     } else {
      break;
     }
    }
    $955 = ($933|0)==($627|0);
    if (!($955)) {
     $956 = $933;
     $957 = $627;
     $958 = (($956) - ($957))|0;
     $959 = HEAP32[$951>>2]|0;
     $960 = $959 & -2;
     HEAP32[$951>>2] = $960;
     $961 = $958 | 1;
     $962 = ((($627)) + 4|0);
     HEAP32[$962>>2] = $961;
     HEAP32[$933>>2] = $958;
     $963 = $958 >>> 3;
     $964 = ($958>>>0)<(256);
     if ($964) {
      $965 = $963 << 1;
      $966 = (9972 + ($965<<2)|0);
      $967 = HEAP32[2483]|0;
      $968 = 1 << $963;
      $969 = $967 & $968;
      $970 = ($969|0)==(0);
      if ($970) {
       $971 = $967 | $968;
       HEAP32[2483] = $971;
       $$pre$i$i = ((($966)) + 8|0);
       $$0211$i$i = $966;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $972 = ((($966)) + 8|0);
       $973 = HEAP32[$972>>2]|0;
       $974 = HEAP32[(9948)>>2]|0;
       $975 = ($973>>>0)<($974>>>0);
       if ($975) {
        _abort();
        // unreachable;
       } else {
        $$0211$i$i = $973;$$pre$phi$i$iZ2D = $972;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $627;
      $976 = ((($$0211$i$i)) + 12|0);
      HEAP32[$976>>2] = $627;
      $977 = ((($627)) + 8|0);
      HEAP32[$977>>2] = $$0211$i$i;
      $978 = ((($627)) + 12|0);
      HEAP32[$978>>2] = $966;
      break;
     }
     $979 = $958 >>> 8;
     $980 = ($979|0)==(0);
     if ($980) {
      $$0212$i$i = 0;
     } else {
      $981 = ($958>>>0)>(16777215);
      if ($981) {
       $$0212$i$i = 31;
      } else {
       $982 = (($979) + 1048320)|0;
       $983 = $982 >>> 16;
       $984 = $983 & 8;
       $985 = $979 << $984;
       $986 = (($985) + 520192)|0;
       $987 = $986 >>> 16;
       $988 = $987 & 4;
       $989 = $988 | $984;
       $990 = $985 << $988;
       $991 = (($990) + 245760)|0;
       $992 = $991 >>> 16;
       $993 = $992 & 2;
       $994 = $989 | $993;
       $995 = (14 - ($994))|0;
       $996 = $990 << $993;
       $997 = $996 >>> 15;
       $998 = (($995) + ($997))|0;
       $999 = $998 << 1;
       $1000 = (($998) + 7)|0;
       $1001 = $958 >>> $1000;
       $1002 = $1001 & 1;
       $1003 = $1002 | $999;
       $$0212$i$i = $1003;
      }
     }
     $1004 = (10236 + ($$0212$i$i<<2)|0);
     $1005 = ((($627)) + 28|0);
     HEAP32[$1005>>2] = $$0212$i$i;
     $1006 = ((($627)) + 20|0);
     HEAP32[$1006>>2] = 0;
     HEAP32[$931>>2] = 0;
     $1007 = HEAP32[(9936)>>2]|0;
     $1008 = 1 << $$0212$i$i;
     $1009 = $1007 & $1008;
     $1010 = ($1009|0)==(0);
     if ($1010) {
      $1011 = $1007 | $1008;
      HEAP32[(9936)>>2] = $1011;
      HEAP32[$1004>>2] = $627;
      $1012 = ((($627)) + 24|0);
      HEAP32[$1012>>2] = $1004;
      $1013 = ((($627)) + 12|0);
      HEAP32[$1013>>2] = $627;
      $1014 = ((($627)) + 8|0);
      HEAP32[$1014>>2] = $627;
      break;
     }
     $1015 = HEAP32[$1004>>2]|0;
     $1016 = ($$0212$i$i|0)==(31);
     $1017 = $$0212$i$i >>> 1;
     $1018 = (25 - ($1017))|0;
     $1019 = $1016 ? 0 : $1018;
     $1020 = $958 << $1019;
     $$0206$i$i = $1020;$$0207$i$i = $1015;
     while(1) {
      $1021 = ((($$0207$i$i)) + 4|0);
      $1022 = HEAP32[$1021>>2]|0;
      $1023 = $1022 & -8;
      $1024 = ($1023|0)==($958|0);
      if ($1024) {
       label = 304;
       break;
      }
      $1025 = $$0206$i$i >>> 31;
      $1026 = (((($$0207$i$i)) + 16|0) + ($1025<<2)|0);
      $1027 = $$0206$i$i << 1;
      $1028 = HEAP32[$1026>>2]|0;
      $1029 = ($1028|0)==(0|0);
      if ($1029) {
       label = 301;
       break;
      } else {
       $$0206$i$i = $1027;$$0207$i$i = $1028;
      }
     }
     if ((label|0) == 301) {
      $1030 = HEAP32[(9948)>>2]|0;
      $1031 = ($1026>>>0)<($1030>>>0);
      if ($1031) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$1026>>2] = $627;
       $1032 = ((($627)) + 24|0);
       HEAP32[$1032>>2] = $$0207$i$i;
       $1033 = ((($627)) + 12|0);
       HEAP32[$1033>>2] = $627;
       $1034 = ((($627)) + 8|0);
       HEAP32[$1034>>2] = $627;
       break;
      }
     }
     else if ((label|0) == 304) {
      $1035 = ((($$0207$i$i)) + 8|0);
      $1036 = HEAP32[$1035>>2]|0;
      $1037 = HEAP32[(9948)>>2]|0;
      $1038 = ($1036>>>0)>=($1037>>>0);
      $not$$i$i = ($$0207$i$i>>>0)>=($1037>>>0);
      $1039 = $1038 & $not$$i$i;
      if ($1039) {
       $1040 = ((($1036)) + 12|0);
       HEAP32[$1040>>2] = $627;
       HEAP32[$1035>>2] = $627;
       $1041 = ((($627)) + 8|0);
       HEAP32[$1041>>2] = $1036;
       $1042 = ((($627)) + 12|0);
       HEAP32[$1042>>2] = $$0207$i$i;
       $1043 = ((($627)) + 24|0);
       HEAP32[$1043>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1045 = HEAP32[(9944)>>2]|0;
  $1046 = ($1045>>>0)>($$0197>>>0);
  if ($1046) {
   $1047 = (($1045) - ($$0197))|0;
   HEAP32[(9944)>>2] = $1047;
   $1048 = HEAP32[(9956)>>2]|0;
   $1049 = (($1048) + ($$0197)|0);
   HEAP32[(9956)>>2] = $1049;
   $1050 = $1047 | 1;
   $1051 = ((($1049)) + 4|0);
   HEAP32[$1051>>2] = $1050;
   $1052 = $$0197 | 3;
   $1053 = ((($1048)) + 4|0);
   HEAP32[$1053>>2] = $1052;
   $1054 = ((($1048)) + 8|0);
   $$0 = $1054;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $1055 = (___errno_location()|0);
 HEAP32[$1055>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0211$i = 0, $$0211$in$i = 0, $$0381 = 0, $$0382 = 0, $$0394 = 0, $$0401 = 0, $$1 = 0, $$1380 = 0, $$1385 = 0, $$1388 = 0, $$1396 = 0, $$1400 = 0, $$2 = 0, $$3 = 0, $$3398 = 0, $$pre = 0, $$pre$phi439Z2D = 0, $$pre$phi441Z2D = 0, $$pre$phiZ2D = 0, $$pre438 = 0;
 var $$pre440 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0;
 var $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0;
 var $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0;
 var $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $cond418 = 0, $cond419 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(9948)>>2]|0;
 $4 = ($2>>>0)<($3>>>0);
 if ($4) {
  _abort();
  // unreachable;
 }
 $5 = ((($0)) + -4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 & 3;
 $8 = ($7|0)==(1);
 if ($8) {
  _abort();
  // unreachable;
 }
 $9 = $6 & -8;
 $10 = (($2) + ($9)|0);
 $11 = $6 & 1;
 $12 = ($11|0)==(0);
 do {
  if ($12) {
   $13 = HEAP32[$2>>2]|0;
   $14 = ($7|0)==(0);
   if ($14) {
    return;
   }
   $15 = (0 - ($13))|0;
   $16 = (($2) + ($15)|0);
   $17 = (($13) + ($9))|0;
   $18 = ($16>>>0)<($3>>>0);
   if ($18) {
    _abort();
    // unreachable;
   }
   $19 = HEAP32[(9952)>>2]|0;
   $20 = ($16|0)==($19|0);
   if ($20) {
    $105 = ((($10)) + 4|0);
    $106 = HEAP32[$105>>2]|0;
    $107 = $106 & 3;
    $108 = ($107|0)==(3);
    if (!($108)) {
     $$1 = $16;$$1380 = $17;
     break;
    }
    HEAP32[(9940)>>2] = $17;
    $109 = $106 & -2;
    HEAP32[$105>>2] = $109;
    $110 = $17 | 1;
    $111 = ((($16)) + 4|0);
    HEAP32[$111>>2] = $110;
    $112 = (($16) + ($17)|0);
    HEAP32[$112>>2] = $17;
    return;
   }
   $21 = $13 >>> 3;
   $22 = ($13>>>0)<(256);
   if ($22) {
    $23 = ((($16)) + 8|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ((($16)) + 12|0);
    $26 = HEAP32[$25>>2]|0;
    $27 = $21 << 1;
    $28 = (9972 + ($27<<2)|0);
    $29 = ($24|0)==($28|0);
    if (!($29)) {
     $30 = ($24>>>0)<($3>>>0);
     if ($30) {
      _abort();
      // unreachable;
     }
     $31 = ((($24)) + 12|0);
     $32 = HEAP32[$31>>2]|0;
     $33 = ($32|0)==($16|0);
     if (!($33)) {
      _abort();
      // unreachable;
     }
    }
    $34 = ($26|0)==($24|0);
    if ($34) {
     $35 = 1 << $21;
     $36 = $35 ^ -1;
     $37 = HEAP32[2483]|0;
     $38 = $37 & $36;
     HEAP32[2483] = $38;
     $$1 = $16;$$1380 = $17;
     break;
    }
    $39 = ($26|0)==($28|0);
    if ($39) {
     $$pre440 = ((($26)) + 8|0);
     $$pre$phi441Z2D = $$pre440;
    } else {
     $40 = ($26>>>0)<($3>>>0);
     if ($40) {
      _abort();
      // unreachable;
     }
     $41 = ((($26)) + 8|0);
     $42 = HEAP32[$41>>2]|0;
     $43 = ($42|0)==($16|0);
     if ($43) {
      $$pre$phi441Z2D = $41;
     } else {
      _abort();
      // unreachable;
     }
    }
    $44 = ((($24)) + 12|0);
    HEAP32[$44>>2] = $26;
    HEAP32[$$pre$phi441Z2D>>2] = $24;
    $$1 = $16;$$1380 = $17;
    break;
   }
   $45 = ((($16)) + 24|0);
   $46 = HEAP32[$45>>2]|0;
   $47 = ((($16)) + 12|0);
   $48 = HEAP32[$47>>2]|0;
   $49 = ($48|0)==($16|0);
   do {
    if ($49) {
     $59 = ((($16)) + 16|0);
     $60 = ((($59)) + 4|0);
     $61 = HEAP32[$60>>2]|0;
     $62 = ($61|0)==(0|0);
     if ($62) {
      $63 = HEAP32[$59>>2]|0;
      $64 = ($63|0)==(0|0);
      if ($64) {
       $$3 = 0;
       break;
      } else {
       $$1385 = $63;$$1388 = $59;
      }
     } else {
      $$1385 = $61;$$1388 = $60;
     }
     while(1) {
      $65 = ((($$1385)) + 20|0);
      $66 = HEAP32[$65>>2]|0;
      $67 = ($66|0)==(0|0);
      if (!($67)) {
       $$1385 = $66;$$1388 = $65;
       continue;
      }
      $68 = ((($$1385)) + 16|0);
      $69 = HEAP32[$68>>2]|0;
      $70 = ($69|0)==(0|0);
      if ($70) {
       break;
      } else {
       $$1385 = $69;$$1388 = $68;
      }
     }
     $71 = ($$1388>>>0)<($3>>>0);
     if ($71) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$$1388>>2] = 0;
      $$3 = $$1385;
      break;
     }
    } else {
     $50 = ((($16)) + 8|0);
     $51 = HEAP32[$50>>2]|0;
     $52 = ($51>>>0)<($3>>>0);
     if ($52) {
      _abort();
      // unreachable;
     }
     $53 = ((($51)) + 12|0);
     $54 = HEAP32[$53>>2]|0;
     $55 = ($54|0)==($16|0);
     if (!($55)) {
      _abort();
      // unreachable;
     }
     $56 = ((($48)) + 8|0);
     $57 = HEAP32[$56>>2]|0;
     $58 = ($57|0)==($16|0);
     if ($58) {
      HEAP32[$53>>2] = $48;
      HEAP32[$56>>2] = $51;
      $$3 = $48;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $72 = ($46|0)==(0|0);
   if ($72) {
    $$1 = $16;$$1380 = $17;
   } else {
    $73 = ((($16)) + 28|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = (10236 + ($74<<2)|0);
    $76 = HEAP32[$75>>2]|0;
    $77 = ($16|0)==($76|0);
    if ($77) {
     HEAP32[$75>>2] = $$3;
     $cond418 = ($$3|0)==(0|0);
     if ($cond418) {
      $78 = 1 << $74;
      $79 = $78 ^ -1;
      $80 = HEAP32[(9936)>>2]|0;
      $81 = $80 & $79;
      HEAP32[(9936)>>2] = $81;
      $$1 = $16;$$1380 = $17;
      break;
     }
    } else {
     $82 = HEAP32[(9948)>>2]|0;
     $83 = ($46>>>0)<($82>>>0);
     if ($83) {
      _abort();
      // unreachable;
     }
     $84 = ((($46)) + 16|0);
     $85 = HEAP32[$84>>2]|0;
     $86 = ($85|0)==($16|0);
     if ($86) {
      HEAP32[$84>>2] = $$3;
     } else {
      $87 = ((($46)) + 20|0);
      HEAP32[$87>>2] = $$3;
     }
     $88 = ($$3|0)==(0|0);
     if ($88) {
      $$1 = $16;$$1380 = $17;
      break;
     }
    }
    $89 = HEAP32[(9948)>>2]|0;
    $90 = ($$3>>>0)<($89>>>0);
    if ($90) {
     _abort();
     // unreachable;
    }
    $91 = ((($$3)) + 24|0);
    HEAP32[$91>>2] = $46;
    $92 = ((($16)) + 16|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = ($93|0)==(0|0);
    do {
     if (!($94)) {
      $95 = ($93>>>0)<($89>>>0);
      if ($95) {
       _abort();
       // unreachable;
      } else {
       $96 = ((($$3)) + 16|0);
       HEAP32[$96>>2] = $93;
       $97 = ((($93)) + 24|0);
       HEAP32[$97>>2] = $$3;
       break;
      }
     }
    } while(0);
    $98 = ((($92)) + 4|0);
    $99 = HEAP32[$98>>2]|0;
    $100 = ($99|0)==(0|0);
    if ($100) {
     $$1 = $16;$$1380 = $17;
    } else {
     $101 = HEAP32[(9948)>>2]|0;
     $102 = ($99>>>0)<($101>>>0);
     if ($102) {
      _abort();
      // unreachable;
     } else {
      $103 = ((($$3)) + 20|0);
      HEAP32[$103>>2] = $99;
      $104 = ((($99)) + 24|0);
      HEAP32[$104>>2] = $$3;
      $$1 = $16;$$1380 = $17;
      break;
     }
    }
   }
  } else {
   $$1 = $2;$$1380 = $9;
  }
 } while(0);
 $113 = ($$1>>>0)<($10>>>0);
 if (!($113)) {
  _abort();
  // unreachable;
 }
 $114 = ((($10)) + 4|0);
 $115 = HEAP32[$114>>2]|0;
 $116 = $115 & 1;
 $117 = ($116|0)==(0);
 if ($117) {
  _abort();
  // unreachable;
 }
 $118 = $115 & 2;
 $119 = ($118|0)==(0);
 if ($119) {
  $120 = HEAP32[(9956)>>2]|0;
  $121 = ($10|0)==($120|0);
  if ($121) {
   $122 = HEAP32[(9944)>>2]|0;
   $123 = (($122) + ($$1380))|0;
   HEAP32[(9944)>>2] = $123;
   HEAP32[(9956)>>2] = $$1;
   $124 = $123 | 1;
   $125 = ((($$1)) + 4|0);
   HEAP32[$125>>2] = $124;
   $126 = HEAP32[(9952)>>2]|0;
   $127 = ($$1|0)==($126|0);
   if (!($127)) {
    return;
   }
   HEAP32[(9952)>>2] = 0;
   HEAP32[(9940)>>2] = 0;
   return;
  }
  $128 = HEAP32[(9952)>>2]|0;
  $129 = ($10|0)==($128|0);
  if ($129) {
   $130 = HEAP32[(9940)>>2]|0;
   $131 = (($130) + ($$1380))|0;
   HEAP32[(9940)>>2] = $131;
   HEAP32[(9952)>>2] = $$1;
   $132 = $131 | 1;
   $133 = ((($$1)) + 4|0);
   HEAP32[$133>>2] = $132;
   $134 = (($$1) + ($131)|0);
   HEAP32[$134>>2] = $131;
   return;
  }
  $135 = $115 & -8;
  $136 = (($135) + ($$1380))|0;
  $137 = $115 >>> 3;
  $138 = ($115>>>0)<(256);
  do {
   if ($138) {
    $139 = ((($10)) + 8|0);
    $140 = HEAP32[$139>>2]|0;
    $141 = ((($10)) + 12|0);
    $142 = HEAP32[$141>>2]|0;
    $143 = $137 << 1;
    $144 = (9972 + ($143<<2)|0);
    $145 = ($140|0)==($144|0);
    if (!($145)) {
     $146 = HEAP32[(9948)>>2]|0;
     $147 = ($140>>>0)<($146>>>0);
     if ($147) {
      _abort();
      // unreachable;
     }
     $148 = ((($140)) + 12|0);
     $149 = HEAP32[$148>>2]|0;
     $150 = ($149|0)==($10|0);
     if (!($150)) {
      _abort();
      // unreachable;
     }
    }
    $151 = ($142|0)==($140|0);
    if ($151) {
     $152 = 1 << $137;
     $153 = $152 ^ -1;
     $154 = HEAP32[2483]|0;
     $155 = $154 & $153;
     HEAP32[2483] = $155;
     break;
    }
    $156 = ($142|0)==($144|0);
    if ($156) {
     $$pre438 = ((($142)) + 8|0);
     $$pre$phi439Z2D = $$pre438;
    } else {
     $157 = HEAP32[(9948)>>2]|0;
     $158 = ($142>>>0)<($157>>>0);
     if ($158) {
      _abort();
      // unreachable;
     }
     $159 = ((($142)) + 8|0);
     $160 = HEAP32[$159>>2]|0;
     $161 = ($160|0)==($10|0);
     if ($161) {
      $$pre$phi439Z2D = $159;
     } else {
      _abort();
      // unreachable;
     }
    }
    $162 = ((($140)) + 12|0);
    HEAP32[$162>>2] = $142;
    HEAP32[$$pre$phi439Z2D>>2] = $140;
   } else {
    $163 = ((($10)) + 24|0);
    $164 = HEAP32[$163>>2]|0;
    $165 = ((($10)) + 12|0);
    $166 = HEAP32[$165>>2]|0;
    $167 = ($166|0)==($10|0);
    do {
     if ($167) {
      $178 = ((($10)) + 16|0);
      $179 = ((($178)) + 4|0);
      $180 = HEAP32[$179>>2]|0;
      $181 = ($180|0)==(0|0);
      if ($181) {
       $182 = HEAP32[$178>>2]|0;
       $183 = ($182|0)==(0|0);
       if ($183) {
        $$3398 = 0;
        break;
       } else {
        $$1396 = $182;$$1400 = $178;
       }
      } else {
       $$1396 = $180;$$1400 = $179;
      }
      while(1) {
       $184 = ((($$1396)) + 20|0);
       $185 = HEAP32[$184>>2]|0;
       $186 = ($185|0)==(0|0);
       if (!($186)) {
        $$1396 = $185;$$1400 = $184;
        continue;
       }
       $187 = ((($$1396)) + 16|0);
       $188 = HEAP32[$187>>2]|0;
       $189 = ($188|0)==(0|0);
       if ($189) {
        break;
       } else {
        $$1396 = $188;$$1400 = $187;
       }
      }
      $190 = HEAP32[(9948)>>2]|0;
      $191 = ($$1400>>>0)<($190>>>0);
      if ($191) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$1400>>2] = 0;
       $$3398 = $$1396;
       break;
      }
     } else {
      $168 = ((($10)) + 8|0);
      $169 = HEAP32[$168>>2]|0;
      $170 = HEAP32[(9948)>>2]|0;
      $171 = ($169>>>0)<($170>>>0);
      if ($171) {
       _abort();
       // unreachable;
      }
      $172 = ((($169)) + 12|0);
      $173 = HEAP32[$172>>2]|0;
      $174 = ($173|0)==($10|0);
      if (!($174)) {
       _abort();
       // unreachable;
      }
      $175 = ((($166)) + 8|0);
      $176 = HEAP32[$175>>2]|0;
      $177 = ($176|0)==($10|0);
      if ($177) {
       HEAP32[$172>>2] = $166;
       HEAP32[$175>>2] = $169;
       $$3398 = $166;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $192 = ($164|0)==(0|0);
    if (!($192)) {
     $193 = ((($10)) + 28|0);
     $194 = HEAP32[$193>>2]|0;
     $195 = (10236 + ($194<<2)|0);
     $196 = HEAP32[$195>>2]|0;
     $197 = ($10|0)==($196|0);
     if ($197) {
      HEAP32[$195>>2] = $$3398;
      $cond419 = ($$3398|0)==(0|0);
      if ($cond419) {
       $198 = 1 << $194;
       $199 = $198 ^ -1;
       $200 = HEAP32[(9936)>>2]|0;
       $201 = $200 & $199;
       HEAP32[(9936)>>2] = $201;
       break;
      }
     } else {
      $202 = HEAP32[(9948)>>2]|0;
      $203 = ($164>>>0)<($202>>>0);
      if ($203) {
       _abort();
       // unreachable;
      }
      $204 = ((($164)) + 16|0);
      $205 = HEAP32[$204>>2]|0;
      $206 = ($205|0)==($10|0);
      if ($206) {
       HEAP32[$204>>2] = $$3398;
      } else {
       $207 = ((($164)) + 20|0);
       HEAP32[$207>>2] = $$3398;
      }
      $208 = ($$3398|0)==(0|0);
      if ($208) {
       break;
      }
     }
     $209 = HEAP32[(9948)>>2]|0;
     $210 = ($$3398>>>0)<($209>>>0);
     if ($210) {
      _abort();
      // unreachable;
     }
     $211 = ((($$3398)) + 24|0);
     HEAP32[$211>>2] = $164;
     $212 = ((($10)) + 16|0);
     $213 = HEAP32[$212>>2]|0;
     $214 = ($213|0)==(0|0);
     do {
      if (!($214)) {
       $215 = ($213>>>0)<($209>>>0);
       if ($215) {
        _abort();
        // unreachable;
       } else {
        $216 = ((($$3398)) + 16|0);
        HEAP32[$216>>2] = $213;
        $217 = ((($213)) + 24|0);
        HEAP32[$217>>2] = $$3398;
        break;
       }
      }
     } while(0);
     $218 = ((($212)) + 4|0);
     $219 = HEAP32[$218>>2]|0;
     $220 = ($219|0)==(0|0);
     if (!($220)) {
      $221 = HEAP32[(9948)>>2]|0;
      $222 = ($219>>>0)<($221>>>0);
      if ($222) {
       _abort();
       // unreachable;
      } else {
       $223 = ((($$3398)) + 20|0);
       HEAP32[$223>>2] = $219;
       $224 = ((($219)) + 24|0);
       HEAP32[$224>>2] = $$3398;
       break;
      }
     }
    }
   }
  } while(0);
  $225 = $136 | 1;
  $226 = ((($$1)) + 4|0);
  HEAP32[$226>>2] = $225;
  $227 = (($$1) + ($136)|0);
  HEAP32[$227>>2] = $136;
  $228 = HEAP32[(9952)>>2]|0;
  $229 = ($$1|0)==($228|0);
  if ($229) {
   HEAP32[(9940)>>2] = $136;
   return;
  } else {
   $$2 = $136;
  }
 } else {
  $230 = $115 & -2;
  HEAP32[$114>>2] = $230;
  $231 = $$1380 | 1;
  $232 = ((($$1)) + 4|0);
  HEAP32[$232>>2] = $231;
  $233 = (($$1) + ($$1380)|0);
  HEAP32[$233>>2] = $$1380;
  $$2 = $$1380;
 }
 $234 = $$2 >>> 3;
 $235 = ($$2>>>0)<(256);
 if ($235) {
  $236 = $234 << 1;
  $237 = (9972 + ($236<<2)|0);
  $238 = HEAP32[2483]|0;
  $239 = 1 << $234;
  $240 = $238 & $239;
  $241 = ($240|0)==(0);
  if ($241) {
   $242 = $238 | $239;
   HEAP32[2483] = $242;
   $$pre = ((($237)) + 8|0);
   $$0401 = $237;$$pre$phiZ2D = $$pre;
  } else {
   $243 = ((($237)) + 8|0);
   $244 = HEAP32[$243>>2]|0;
   $245 = HEAP32[(9948)>>2]|0;
   $246 = ($244>>>0)<($245>>>0);
   if ($246) {
    _abort();
    // unreachable;
   } else {
    $$0401 = $244;$$pre$phiZ2D = $243;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $247 = ((($$0401)) + 12|0);
  HEAP32[$247>>2] = $$1;
  $248 = ((($$1)) + 8|0);
  HEAP32[$248>>2] = $$0401;
  $249 = ((($$1)) + 12|0);
  HEAP32[$249>>2] = $237;
  return;
 }
 $250 = $$2 >>> 8;
 $251 = ($250|0)==(0);
 if ($251) {
  $$0394 = 0;
 } else {
  $252 = ($$2>>>0)>(16777215);
  if ($252) {
   $$0394 = 31;
  } else {
   $253 = (($250) + 1048320)|0;
   $254 = $253 >>> 16;
   $255 = $254 & 8;
   $256 = $250 << $255;
   $257 = (($256) + 520192)|0;
   $258 = $257 >>> 16;
   $259 = $258 & 4;
   $260 = $259 | $255;
   $261 = $256 << $259;
   $262 = (($261) + 245760)|0;
   $263 = $262 >>> 16;
   $264 = $263 & 2;
   $265 = $260 | $264;
   $266 = (14 - ($265))|0;
   $267 = $261 << $264;
   $268 = $267 >>> 15;
   $269 = (($266) + ($268))|0;
   $270 = $269 << 1;
   $271 = (($269) + 7)|0;
   $272 = $$2 >>> $271;
   $273 = $272 & 1;
   $274 = $273 | $270;
   $$0394 = $274;
  }
 }
 $275 = (10236 + ($$0394<<2)|0);
 $276 = ((($$1)) + 28|0);
 HEAP32[$276>>2] = $$0394;
 $277 = ((($$1)) + 16|0);
 $278 = ((($$1)) + 20|0);
 HEAP32[$278>>2] = 0;
 HEAP32[$277>>2] = 0;
 $279 = HEAP32[(9936)>>2]|0;
 $280 = 1 << $$0394;
 $281 = $279 & $280;
 $282 = ($281|0)==(0);
 do {
  if ($282) {
   $283 = $279 | $280;
   HEAP32[(9936)>>2] = $283;
   HEAP32[$275>>2] = $$1;
   $284 = ((($$1)) + 24|0);
   HEAP32[$284>>2] = $275;
   $285 = ((($$1)) + 12|0);
   HEAP32[$285>>2] = $$1;
   $286 = ((($$1)) + 8|0);
   HEAP32[$286>>2] = $$1;
  } else {
   $287 = HEAP32[$275>>2]|0;
   $288 = ($$0394|0)==(31);
   $289 = $$0394 >>> 1;
   $290 = (25 - ($289))|0;
   $291 = $288 ? 0 : $290;
   $292 = $$2 << $291;
   $$0381 = $292;$$0382 = $287;
   while(1) {
    $293 = ((($$0382)) + 4|0);
    $294 = HEAP32[$293>>2]|0;
    $295 = $294 & -8;
    $296 = ($295|0)==($$2|0);
    if ($296) {
     label = 130;
     break;
    }
    $297 = $$0381 >>> 31;
    $298 = (((($$0382)) + 16|0) + ($297<<2)|0);
    $299 = $$0381 << 1;
    $300 = HEAP32[$298>>2]|0;
    $301 = ($300|0)==(0|0);
    if ($301) {
     label = 127;
     break;
    } else {
     $$0381 = $299;$$0382 = $300;
    }
   }
   if ((label|0) == 127) {
    $302 = HEAP32[(9948)>>2]|0;
    $303 = ($298>>>0)<($302>>>0);
    if ($303) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$298>>2] = $$1;
     $304 = ((($$1)) + 24|0);
     HEAP32[$304>>2] = $$0382;
     $305 = ((($$1)) + 12|0);
     HEAP32[$305>>2] = $$1;
     $306 = ((($$1)) + 8|0);
     HEAP32[$306>>2] = $$1;
     break;
    }
   }
   else if ((label|0) == 130) {
    $307 = ((($$0382)) + 8|0);
    $308 = HEAP32[$307>>2]|0;
    $309 = HEAP32[(9948)>>2]|0;
    $310 = ($308>>>0)>=($309>>>0);
    $not$ = ($$0382>>>0)>=($309>>>0);
    $311 = $310 & $not$;
    if ($311) {
     $312 = ((($308)) + 12|0);
     HEAP32[$312>>2] = $$1;
     HEAP32[$307>>2] = $$1;
     $313 = ((($$1)) + 8|0);
     HEAP32[$313>>2] = $308;
     $314 = ((($$1)) + 12|0);
     HEAP32[$314>>2] = $$0382;
     $315 = ((($$1)) + 24|0);
     HEAP32[$315>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $316 = HEAP32[(9964)>>2]|0;
 $317 = (($316) + -1)|0;
 HEAP32[(9964)>>2] = $317;
 $318 = ($317|0)==(0);
 if ($318) {
  $$0211$in$i = (10388);
 } else {
  return;
 }
 while(1) {
  $$0211$i = HEAP32[$$0211$in$i>>2]|0;
  $319 = ($$0211$i|0)==(0|0);
  $320 = ((($$0211$i)) + 8|0);
  if ($319) {
   break;
  } else {
   $$0211$in$i = $320;
  }
 }
 HEAP32[(9964)>>2] = -1;
 return;
}
function __Znwj($0) {
 $0 = $0|0;
 var $$ = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0);
 $$ = $1 ? 1 : $0;
 while(1) {
  $2 = (_malloc($$)|0);
  $3 = ($2|0)==(0|0);
  if (!($3)) {
   label = 6;
   break;
  }
  $4 = (__ZSt15get_new_handlerv()|0);
  $5 = ($4|0)==(0|0);
  if ($5) {
   label = 5;
   break;
  }
  FUNCTION_TABLE_v[$4 & 63]();
 }
 if ((label|0) == 5) {
  $6 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($6);
  ___cxa_throw(($6|0),(72|0),(19|0));
  // unreachable;
 }
 else if ((label|0) == 6) {
  return ($2|0);
 }
 return (0)|0;
}
function __ZdlPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($0);
 return;
}
function __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___cxa_allocate_exception(8)|0);
 __THREW__ = 0;
 invoke_vii(56,($1|0),(3141|0));
 $2 = __THREW__; __THREW__ = 0;
 $3 = $2&1;
 if ($3) {
  $4 = ___cxa_find_matching_catch_2()|0;
  $5 = tempRet0;
  ___cxa_free_exception(($1|0));
  ___resumeException($4|0);
  // unreachable;
 } else {
  HEAP32[$1>>2] = (632);
  ___cxa_throw(($1|0),(104|0),(22|0));
  // unreachable;
 }
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 ;HEAP32[$0>>2]=0|0;HEAP32[$0+4>>2]=0|0;HEAP32[$0+8>>2]=0|0;
 $2 = ((($1)) + 11|0);
 $3 = HEAP8[$2>>0]|0;
 $4 = ($3<<24>>24)<(0);
 if ($4) {
  $5 = HEAP32[$1>>2]|0;
  $6 = ((($1)) + 4|0);
  $7 = HEAP32[$6>>2]|0;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcj($0,$5,$7);
 } else {
  ;HEAP32[$0>>2]=HEAP32[$1>>2]|0;HEAP32[$0+4>>2]=HEAP32[$1+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$1+8>>2]|0;
 }
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$016 = 0, $$017 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($2>>>0)>(4294967279);
 if ($3) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $4 = ($2>>>0)<(11);
 if ($4) {
  $11 = $2&255;
  $12 = ((($0)) + 11|0);
  HEAP8[$12>>0] = $11;
  $13 = ($2|0)==(0);
  if ($13) {
   $$017 = $0;
  } else {
   $$016 = $0;
   label = 6;
  }
 } else {
  $5 = (($2) + 16)|0;
  $6 = $5 & -16;
  $7 = (__Znwj($6)|0);
  HEAP32[$0>>2] = $7;
  $8 = $6 | -2147483648;
  $9 = ((($0)) + 8|0);
  HEAP32[$9>>2] = $8;
  $10 = ((($0)) + 4|0);
  HEAP32[$10>>2] = $2;
  $$016 = $7;
  label = 6;
 }
 if ((label|0) == 6) {
  _memcpy(($$016|0),($1|0),($2|0))|0;
  $$017 = $$016;
 }
 $14 = (($$017) + ($2)|0);
 HEAP8[$14>>0] = 0;
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 11|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = ($2<<24>>24)<(0);
 if ($3) {
  $4 = HEAP32[$0>>2]|0;
  __ZdlPv($4);
 }
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEaSERKS5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==($1|0);
 if (!($2)) {
  $3 = ((($1)) + 11|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = ($4<<24>>24)<(0);
  $6 = HEAP32[$1>>2]|0;
  $7 = $5 ? $6 : $1;
  $8 = ((($1)) + 4|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $4&255;
  $11 = $5 ? $9 : $10;
  (__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKcj($0,$7,$11)|0);
 }
 return ($0|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6assignEPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, $phitmp$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 11|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = ($4<<24>>24)<(0);
 if ($5) {
  $6 = ((($0)) + 8|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = $7 & 2147483647;
  $phitmp$i = (($8) + -1)|0;
  $9 = $phitmp$i;
 } else {
  $9 = 10;
 }
 $10 = ($9>>>0)<($2>>>0);
 do {
  if ($10) {
   if ($5) {
    $19 = ((($0)) + 4|0);
    $20 = HEAP32[$19>>2]|0;
    $23 = $20;
   } else {
    $21 = $4&255;
    $23 = $21;
   }
   $22 = (($2) - ($9))|0;
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE21__grow_by_and_replaceEjjjjjjPKc($0,$9,$22,$23,0,$23,$2,$1);
  } else {
   if ($5) {
    $11 = HEAP32[$0>>2]|0;
    $13 = $11;
   } else {
    $13 = $0;
   }
   $12 = ($2|0)==(0);
   if (!($12)) {
    _memmove(($13|0),($1|0),($2|0))|0;
   }
   $14 = (($13) + ($2)|0);
   HEAP8[$14>>0] = 0;
   $15 = HEAP8[$3>>0]|0;
   $16 = ($15<<24>>24)<(0);
   if ($16) {
    $17 = ((($0)) + 4|0);
    HEAP32[$17>>2] = $2;
    break;
   } else {
    $18 = $2&255;
    HEAP8[$3>>0] = $18;
    break;
   }
  }
 } while(0);
 return ($0|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE21__grow_by_and_replaceEjjjjjjPKc($0,$1,$2,$3,$4,$5,$6,$7) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 $7 = $7|0;
 var $$sroa$speculated = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $8 = (-18 - ($1))|0;
 $9 = ($8>>>0)<($2>>>0);
 if ($9) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $10 = ((($0)) + 11|0);
 $11 = HEAP8[$10>>0]|0;
 $12 = ($11<<24>>24)<(0);
 if ($12) {
  $13 = HEAP32[$0>>2]|0;
  $24 = $13;
 } else {
  $24 = $0;
 }
 $14 = ($1>>>0)<(2147483623);
 if ($14) {
  $15 = (($2) + ($1))|0;
  $16 = $1 << 1;
  $17 = ($15>>>0)<($16>>>0);
  $$sroa$speculated = $17 ? $16 : $15;
  $18 = ($$sroa$speculated>>>0)<(11);
  $19 = (($$sroa$speculated) + 16)|0;
  $20 = $19 & -16;
  $phitmp = $18 ? 11 : $20;
  $21 = $phitmp;
 } else {
  $21 = -17;
 }
 $22 = (__Znwj($21)|0);
 $23 = ($4|0)==(0);
 if (!($23)) {
  _memcpy(($22|0),($24|0),($4|0))|0;
 }
 $25 = ($6|0)==(0);
 if (!($25)) {
  $26 = (($22) + ($4)|0);
  _memcpy(($26|0),($7|0),($6|0))|0;
 }
 $27 = (($3) - ($5))|0;
 $28 = (($27) - ($4))|0;
 $29 = ($28|0)==(0);
 if (!($29)) {
  $30 = (($22) + ($4)|0);
  $31 = (($30) + ($6)|0);
  $32 = (($24) + ($4)|0);
  $33 = (($32) + ($5)|0);
  _memcpy(($31|0),($33|0),($28|0))|0;
 }
 $34 = ($1|0)==(10);
 if (!($34)) {
  __ZdlPv($24);
 }
 HEAP32[$0>>2] = $22;
 $35 = $21 | -2147483648;
 $36 = ((($0)) + 8|0);
 HEAP32[$36>>2] = $35;
 $37 = (($27) + ($6))|0;
 $38 = ((($0)) + 4|0);
 HEAP32[$38>>2] = $37;
 $39 = (($22) + ($37)|0);
 HEAP8[$39>>0] = 0;
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6resizeEjc($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 11|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = ($4<<24>>24)<(0);
 if ($5) {
  $6 = ((($0)) + 4|0);
  $7 = HEAP32[$6>>2]|0;
  $9 = $7;
 } else {
  $8 = $4&255;
  $9 = $8;
 }
 $10 = ($9>>>0)<($1>>>0);
 do {
  if ($10) {
   $11 = (($1) - ($9))|0;
   (__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEjc($0,$11,$2)|0);
  } else {
   if ($5) {
    $12 = HEAP32[$0>>2]|0;
    $13 = (($12) + ($1)|0);
    HEAP8[$13>>0] = 0;
    $14 = ((($0)) + 4|0);
    HEAP32[$14>>2] = $1;
    break;
   } else {
    $15 = (($0) + ($1)|0);
    HEAP8[$15>>0] = 0;
    $16 = $1&255;
    HEAP8[$3>>0] = $16;
    break;
   }
  }
 } while(0);
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEjc($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1|0)==(0);
 if (!($3)) {
  $4 = ((($0)) + 11|0);
  $5 = HEAP8[$4>>0]|0;
  $6 = ($5<<24>>24)<(0);
  if ($6) {
   $7 = ((($0)) + 8|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = $8 & 2147483647;
   $phitmp$i = (($9) + -1)|0;
   $10 = ((($0)) + 4|0);
   $11 = HEAP32[$10>>2]|0;
   $14 = $11;$15 = $phitmp$i;
  } else {
   $12 = $5&255;
   $14 = $12;$15 = 10;
  }
  $13 = (($15) - ($14))|0;
  $16 = ($13>>>0)<($1>>>0);
  if ($16) {
   $17 = (($1) - ($15))|0;
   $18 = (($17) + ($14))|0;
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE9__grow_byEjjjjjj($0,$15,$18,$14,$14,0,0);
   $$pre = HEAP8[$4>>0]|0;
   $19 = $$pre;
  } else {
   $19 = $5;
  }
  $20 = ($19<<24>>24)<(0);
  if ($20) {
   $21 = HEAP32[$0>>2]|0;
   $23 = $21;
  } else {
   $23 = $0;
  }
  $22 = (($23) + ($14)|0);
  _memset(($22|0),($2|0),($1|0))|0;
  $24 = (($14) + ($1))|0;
  $25 = HEAP8[$4>>0]|0;
  $26 = ($25<<24>>24)<(0);
  if ($26) {
   $27 = ((($0)) + 4|0);
   HEAP32[$27>>2] = $24;
  } else {
   $28 = $24&255;
   HEAP8[$4>>0] = $28;
  }
  $29 = (($23) + ($24)|0);
  HEAP8[$29>>0] = 0;
 }
 return ($0|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE9__grow_byEjjjjjj($0,$1,$2,$3,$4,$5,$6) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 $6 = $6|0;
 var $$sroa$speculated = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $7 = (-17 - ($1))|0;
 $8 = ($7>>>0)<($2>>>0);
 if ($8) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $9 = ((($0)) + 11|0);
 $10 = HEAP8[$9>>0]|0;
 $11 = ($10<<24>>24)<(0);
 if ($11) {
  $12 = HEAP32[$0>>2]|0;
  $23 = $12;
 } else {
  $23 = $0;
 }
 $13 = ($1>>>0)<(2147483623);
 if ($13) {
  $14 = (($2) + ($1))|0;
  $15 = $1 << 1;
  $16 = ($14>>>0)<($15>>>0);
  $$sroa$speculated = $16 ? $15 : $14;
  $17 = ($$sroa$speculated>>>0)<(11);
  $18 = (($$sroa$speculated) + 16)|0;
  $19 = $18 & -16;
  $phitmp = $17 ? 11 : $19;
  $20 = $phitmp;
 } else {
  $20 = -17;
 }
 $21 = (__Znwj($20)|0);
 $22 = ($4|0)==(0);
 if (!($22)) {
  _memcpy(($21|0),($23|0),($4|0))|0;
 }
 $24 = (($3) - ($5))|0;
 $25 = (($24) - ($4))|0;
 $26 = ($25|0)==(0);
 if (!($26)) {
  $27 = (($21) + ($4)|0);
  $28 = (($27) + ($6)|0);
  $29 = (($23) + ($4)|0);
  $30 = (($29) + ($5)|0);
  _memcpy(($28|0),($30|0),($25|0))|0;
 }
 $31 = ($1|0)==(10);
 if (!($31)) {
  __ZdlPv($23);
 }
 HEAP32[$0>>2] = $21;
 $32 = $20 | -2147483648;
 $33 = ((($0)) + 8|0);
 HEAP32[$33>>2] = $32;
 return;
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEPKcj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($0)) + 11|0);
 $4 = HEAP8[$3>>0]|0;
 $5 = ($4<<24>>24)<(0);
 if ($5) {
  $6 = ((($0)) + 8|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = $7 & 2147483647;
  $phitmp$i = (($8) + -1)|0;
  $9 = ((($0)) + 4|0);
  $10 = HEAP32[$9>>2]|0;
  $13 = $10;$14 = $phitmp$i;
 } else {
  $11 = $4&255;
  $13 = $11;$14 = 10;
 }
 $12 = (($14) - ($13))|0;
 $15 = ($12>>>0)<($2>>>0);
 if ($15) {
  $26 = (($2) - ($14))|0;
  $27 = (($26) + ($13))|0;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE21__grow_by_and_replaceEjjjjjjPKc($0,$14,$27,$13,$13,0,$2,$1);
 } else {
  $16 = ($2|0)==(0);
  if (!($16)) {
   if ($5) {
    $17 = HEAP32[$0>>2]|0;
    $19 = $17;
   } else {
    $19 = $0;
   }
   $18 = (($19) + ($13)|0);
   _memcpy(($18|0),($1|0),($2|0))|0;
   $20 = (($13) + ($2))|0;
   $21 = HEAP8[$3>>0]|0;
   $22 = ($21<<24>>24)<(0);
   if ($22) {
    $23 = ((($0)) + 4|0);
    HEAP32[$23>>2] = $20;
   } else {
    $24 = $20&255;
    HEAP8[$3>>0] = $24;
   }
   $25 = (($19) + ($20)|0);
   HEAP8[$25>>0] = 0;
  }
 }
 return ($0|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($1)|0);
 $3 = (__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEPKcj($0,$1,$2)|0);
 return ($3|0);
}
function __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcjj($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ($3>>>0)>(4294967279);
 if ($4) {
  __ZNKSt3__221__basic_string_commonILb1EE20__throw_length_errorEv($0);
  // unreachable;
 }
 $5 = ($3>>>0)<(11);
 if ($5) {
  $6 = $2&255;
  $7 = ((($0)) + 11|0);
  HEAP8[$7>>0] = $6;
  $$0 = $0;
 } else {
  $8 = (($3) + 16)|0;
  $9 = $8 & -16;
  $10 = (__Znwj($9)|0);
  HEAP32[$0>>2] = $10;
  $11 = $9 | -2147483648;
  $12 = ((($0)) + 8|0);
  HEAP32[$12>>2] = $11;
  $13 = ((($0)) + 4|0);
  HEAP32[$13>>2] = $2;
  $$0 = $10;
 }
 $14 = ($2|0)==(0);
 if (!($14)) {
  _memcpy(($$0|0),($1|0),($2|0))|0;
 }
 $15 = (($$0) + ($2)|0);
 HEAP8[$15>>0] = 0;
 return;
}
function __ZNSt3__29to_stringEi($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $$0$i$i$i = 0, $$0$i$i$i2 = 0, $$017$i = 0, $$017$ph$i = 0, $$2$i = 0, $$pre$i = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $exitcond$i$i$i = 0, $exitcond$i$i$i3 = 0, $lpad$phi$index = 0, $lpad$phi$index2 = 0, $phitmp$i$i = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $2 = sp + 4|0;
 ;HEAP32[$2>>2]=0|0;HEAP32[$2+4>>2]=0|0;HEAP32[$2+8>>2]=0|0;
 $$0$i$i$i = 0;
 while(1) {
  $exitcond$i$i$i = ($$0$i$i$i|0)==(3);
  if ($exitcond$i$i$i) {
   break;
  }
  $3 = (($2) + ($$0$i$i$i<<2)|0);
  HEAP32[$3>>2] = 0;
  $4 = (($$0$i$i$i) + 1)|0;
  $$0$i$i$i = $4;
 }
 $5 = ((($2)) + 11|0);
 $6 = HEAP8[$5>>0]|0;
 $7 = ($6<<24>>24)<(0);
 if ($7) {
  $8 = ((($2)) + 8|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $9 & 2147483647;
  $phitmp$i$i = (($10) + -1)|0;
  $11 = $phitmp$i$i;
 } else {
  $11 = 10;
 }
 __THREW__ = 0;
 invoke_viii(57,($2|0),($11|0),0);
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if ($13) {
  $14 = ___cxa_find_matching_catch_2()|0;
  $15 = tempRet0;
  __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($2);
  ___resumeException($14|0);
  // unreachable;
 }
 $16 = HEAP8[$5>>0]|0;
 $17 = ($16<<24>>24)<(0);
 $18 = $16&255;
 $19 = ((($2)) + 4|0);
 $20 = HEAP32[$19>>2]|0;
 $$017$ph$i = $17 ? $20 : $18;
 $$017$i = $$017$ph$i;$21 = $16;
 while(1) {
  $22 = ($21<<24>>24)<(0);
  $23 = HEAP32[$2>>2]|0;
  $$ = $22 ? $23 : $2;
  $24 = (($$017$i) + 1)|0;
  HEAP32[$vararg_buffer>>2] = $1;
  $25 = (_snprintf($$,$24,3154,$vararg_buffer)|0);
  $26 = ($25|0)>(-1);
  if ($26) {
   $27 = ($25>>>0)>($$017$i>>>0);
   if ($27) {
    $$2$i = $25;
   } else {
    label = 14;
    break;
   }
  } else {
   $28 = $$017$i << 1;
   $29 = $28 | 1;
   $$2$i = $29;
  }
  __THREW__ = 0;
  invoke_viii(57,($2|0),($$2$i|0),0);
  $30 = __THREW__; __THREW__ = 0;
  $31 = $30&1;
  if ($31) {
   label = 19;
   break;
  }
  $$pre$i = HEAP8[$5>>0]|0;
  $$017$i = $$2$i;$21 = $$pre$i;
 }
 do {
  if ((label|0) == 14) {
   __THREW__ = 0;
   invoke_viii(57,($2|0),($25|0),0);
   $32 = __THREW__; __THREW__ = 0;
   $33 = $32&1;
   if ($33) {
    $38 = ___cxa_find_matching_catch_2()|0;
    $39 = tempRet0;
    $lpad$phi$index = $38;$lpad$phi$index2 = $39;
    break;
   }
   ;HEAP32[$0>>2]=HEAP32[$2>>2]|0;HEAP32[$0+4>>2]=HEAP32[$2+4>>2]|0;HEAP32[$0+8>>2]=HEAP32[$2+8>>2]|0;
   $$0$i$i$i2 = 0;
   while(1) {
    $exitcond$i$i$i3 = ($$0$i$i$i2|0)==(3);
    if ($exitcond$i$i$i3) {
     break;
    }
    $34 = (($2) + ($$0$i$i$i2<<2)|0);
    HEAP32[$34>>2] = 0;
    $35 = (($$0$i$i$i2) + 1)|0;
    $$0$i$i$i2 = $35;
   }
   __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($2);
   STACKTOP = sp;return;
  }
  else if ((label|0) == 19) {
   $36 = ___cxa_find_matching_catch_2()|0;
   $37 = tempRet0;
   $lpad$phi$index = $36;$lpad$phi$index2 = $37;
  }
 } while(0);
 __ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev($2);
 ___resumeException($lpad$phi$index|0);
 // unreachable;
}
function __ZNSt3__218__libcpp_refstringC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (_strlen($1)|0);
 $3 = (($2) + 13)|0;
 $4 = (__Znwj($3)|0);
 HEAP32[$4>>2] = $2;
 $5 = ((($4)) + 4|0);
 HEAP32[$5>>2] = $2;
 $6 = ((($4)) + 8|0);
 HEAP32[$6>>2] = 0;
 $7 = ((($4)) + 12|0);
 $8 = (($2) + 1)|0;
 _memcpy(($7|0),($1|0),($8|0))|0;
 HEAP32[$0>>2] = $7;
 return;
}
function __ZNSt11logic_errorC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (612);
 $2 = ((($0)) + 4|0);
 __THREW__ = 0;
 invoke_vii(58,($2|0),($1|0));
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  ___resumeException($5|0);
  // unreachable;
 } else {
  return;
 }
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0;
 var $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer10 = sp + 32|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $0 = sp + 36|0;
 $1 = (___cxa_get_globals_fast()|0);
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = ($3|0)==(0|0);
  if (!($4)) {
   $5 = ((($3)) + 80|0);
   $6 = ((($3)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if (!($16)) {
    $37 = HEAP32[125]|0;
    HEAP32[$vararg_buffer7>>2] = $37;
    _abort_message(3243,$vararg_buffer7);
    // unreachable;
   }
   $17 = ($9|0)==(1126902529);
   $18 = ($12|0)==(1129074247);
   $19 = $17 & $18;
   if ($19) {
    $20 = ((($3)) + 44|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = $21;
   } else {
    $22 = $5;
   }
   HEAP32[$0>>2] = $22;
   $23 = HEAP32[$3>>2]|0;
   $24 = ((($23)) + 4|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = HEAP32[2]|0;
   $27 = ((($26)) + 16|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = (FUNCTION_TABLE_iiii[$28 & 63](8,$23,$0)|0);
   if ($29) {
    $30 = HEAP32[$0>>2]|0;
    $31 = HEAP32[125]|0;
    $32 = HEAP32[$30>>2]|0;
    $33 = ((($32)) + 8|0);
    $34 = HEAP32[$33>>2]|0;
    $35 = (FUNCTION_TABLE_ii[$34 & 63]($30)|0);
    HEAP32[$vararg_buffer>>2] = $31;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = $25;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = $35;
    _abort_message(3157,$vararg_buffer);
    // unreachable;
   } else {
    $36 = HEAP32[125]|0;
    HEAP32[$vararg_buffer3>>2] = $36;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $25;
    _abort_message(3202,$vararg_buffer3);
    // unreachable;
   }
  }
 }
 _abort_message(3281,$vararg_buffer10);
 // unreachable;
}
function ___cxa_get_globals_fast() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_once((10428|0),(59|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  $2 = HEAP32[2608]|0;
  $3 = (_pthread_getspecific(($2|0))|0);
  STACKTOP = sp;return ($3|0);
 } else {
  _abort_message(3432,$vararg_buffer);
  // unreachable;
 }
 return (0)|0;
}
function _abort_message($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[67]|0;
 (_vfprintf($2,$0,$1)|0);
 (_fputc(10,$2)|0);
 _abort();
 // unreachable;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = ($0|0)==($1|0);
 if ($4) {
  $$2 = 1;
 } else {
  $5 = ($1|0)==(0|0);
  if ($5) {
   $$2 = 0;
  } else {
   $6 = (___dynamic_cast($1,32,16,0)|0);
   $7 = ($6|0)==(0|0);
   if ($7) {
    $$2 = 0;
   } else {
    $8 = ((($3)) + 4|0);
    dest=$8; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$3>>2] = $6;
    $9 = ((($3)) + 8|0);
    HEAP32[$9>>2] = $0;
    $10 = ((($3)) + 12|0);
    HEAP32[$10>>2] = -1;
    $11 = ((($3)) + 48|0);
    HEAP32[$11>>2] = 1;
    $12 = HEAP32[$6>>2]|0;
    $13 = ((($12)) + 28|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = HEAP32[$2>>2]|0;
    FUNCTION_TABLE_viiii[$14 & 63]($6,$3,$15,1);
    $16 = ((($3)) + 24|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)==(1);
    if ($18) {
     $19 = ((($3)) + 16|0);
     $20 = HEAP32[$19>>2]|0;
     HEAP32[$2>>2] = $20;
     $$0 = 1;
    } else {
     $$0 = 0;
    }
    $$2 = $$0;
   }
  }
 }
 STACKTOP = sp;return ($$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($0|0)==($7|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($0|0)==($6|0);
 do {
  if ($7) {
   $8 = ((($1)) + 4|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==($2|0);
   if ($10) {
    $11 = ((($1)) + 28|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($12|0)==(1);
    if (!($13)) {
     HEAP32[$11>>2] = $3;
    }
   }
  } else {
   $14 = HEAP32[$1>>2]|0;
   $15 = ($0|0)==($14|0);
   if ($15) {
    $16 = ((($1)) + 16|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)==($2|0);
    if (!($18)) {
     $19 = ((($1)) + 20|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($20|0)==($2|0);
     if (!($21)) {
      $24 = ((($1)) + 32|0);
      HEAP32[$24>>2] = $3;
      HEAP32[$19>>2] = $2;
      $25 = ((($1)) + 40|0);
      $26 = HEAP32[$25>>2]|0;
      $27 = (($26) + 1)|0;
      HEAP32[$25>>2] = $27;
      $28 = ((($1)) + 36|0);
      $29 = HEAP32[$28>>2]|0;
      $30 = ($29|0)==(1);
      if ($30) {
       $31 = ((($1)) + 24|0);
       $32 = HEAP32[$31>>2]|0;
       $33 = ($32|0)==(2);
       if ($33) {
        $34 = ((($1)) + 54|0);
        HEAP8[$34>>0] = 1;
       }
      }
      $35 = ((($1)) + 44|0);
      HEAP32[$35>>2] = 4;
      break;
     }
    }
    $22 = ($3|0)==(1);
    if ($22) {
     $23 = ((($1)) + 32|0);
     HEAP32[$23>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($0|0)==($5|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 do {
  if ($6) {
   HEAP32[$4>>2] = $2;
   $7 = ((($1)) + 24|0);
   HEAP32[$7>>2] = $3;
   $8 = ((($1)) + 36|0);
   HEAP32[$8>>2] = 1;
  } else {
   $9 = ($5|0)==($2|0);
   if (!($9)) {
    $13 = ((($1)) + 36|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = (($14) + 1)|0;
    HEAP32[$13>>2] = $15;
    $16 = ((($1)) + 24|0);
    HEAP32[$16>>2] = 2;
    $17 = ((($1)) + 54|0);
    HEAP8[$17>>0] = 1;
    break;
   }
   $10 = ((($1)) + 24|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(2);
   if ($12) {
    HEAP32[$10>>2] = $3;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond22 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 53|0);
 HEAP8[$5>>0] = 1;
 $6 = ((($1)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==($3|0);
 do {
  if ($8) {
   $9 = ((($1)) + 52|0);
   HEAP8[$9>>0] = 1;
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(0|0);
   if ($12) {
    HEAP32[$10>>2] = $2;
    $13 = ((($1)) + 24|0);
    HEAP32[$13>>2] = $4;
    $14 = ((($1)) + 36|0);
    HEAP32[$14>>2] = 1;
    $15 = ((($1)) + 48|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==(1);
    $18 = ($4|0)==(1);
    $or$cond = $17 & $18;
    if (!($or$cond)) {
     break;
    }
    $19 = ((($1)) + 54|0);
    HEAP8[$19>>0] = 1;
    break;
   }
   $20 = ($11|0)==($2|0);
   if (!($20)) {
    $30 = ((($1)) + 36|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = (($31) + 1)|0;
    HEAP32[$30>>2] = $32;
    $33 = ((($1)) + 54|0);
    HEAP8[$33>>0] = 1;
    break;
   }
   $21 = ((($1)) + 24|0);
   $22 = HEAP32[$21>>2]|0;
   $23 = ($22|0)==(2);
   if ($23) {
    HEAP32[$21>>2] = $4;
    $27 = $4;
   } else {
    $27 = $22;
   }
   $24 = ((($1)) + 48|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = ($25|0)==(1);
   $28 = ($27|0)==(1);
   $or$cond22 = $26 & $28;
   if ($or$cond22) {
    $29 = ((($1)) + 54|0);
    HEAP8[$29>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $$0 = 0, $$33 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond28 = 0, $or$cond30 = 0, $or$cond32 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $4 = sp;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + -8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($0) + ($7)|0);
 $9 = ((($5)) + -4|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$4>>2] = $2;
 $11 = ((($4)) + 4|0);
 HEAP32[$11>>2] = $0;
 $12 = ((($4)) + 8|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($4)) + 12|0);
 HEAP32[$13>>2] = $3;
 $14 = ((($4)) + 16|0);
 $15 = ((($4)) + 20|0);
 $16 = ((($4)) + 24|0);
 $17 = ((($4)) + 28|0);
 $18 = ((($4)) + 32|0);
 $19 = ((($4)) + 40|0);
 $20 = ($10|0)==($2|0);
 dest=$14; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$14+36>>1]=0|0;HEAP8[$14+38>>0]=0|0;
 L1: do {
  if ($20) {
   $21 = ((($4)) + 48|0);
   HEAP32[$21>>2] = 1;
   $22 = HEAP32[$2>>2]|0;
   $23 = ((($22)) + 20|0);
   $24 = HEAP32[$23>>2]|0;
   FUNCTION_TABLE_viiiiii[$24 & 31]($2,$4,$8,$8,1,0);
   $25 = HEAP32[$16>>2]|0;
   $26 = ($25|0)==(1);
   $$ = $26 ? $8 : 0;
   $$0 = $$;
  } else {
   $27 = ((($4)) + 36|0);
   $28 = HEAP32[$10>>2]|0;
   $29 = ((($28)) + 24|0);
   $30 = HEAP32[$29>>2]|0;
   FUNCTION_TABLE_viiiii[$30 & 31]($10,$4,$8,1,0);
   $31 = HEAP32[$27>>2]|0;
   switch ($31|0) {
   case 0:  {
    $32 = HEAP32[$19>>2]|0;
    $33 = ($32|0)==(1);
    $34 = HEAP32[$17>>2]|0;
    $35 = ($34|0)==(1);
    $or$cond = $33 & $35;
    $36 = HEAP32[$18>>2]|0;
    $37 = ($36|0)==(1);
    $or$cond28 = $or$cond & $37;
    $38 = HEAP32[$15>>2]|0;
    $$33 = $or$cond28 ? $38 : 0;
    $$0 = $$33;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $$0 = 0;
    break L1;
   }
   }
   $39 = HEAP32[$16>>2]|0;
   $40 = ($39|0)==(1);
   if (!($40)) {
    $41 = HEAP32[$19>>2]|0;
    $42 = ($41|0)==(0);
    $43 = HEAP32[$17>>2]|0;
    $44 = ($43|0)==(1);
    $or$cond30 = $42 & $44;
    $45 = HEAP32[$18>>2]|0;
    $46 = ($45|0)==(1);
    $or$cond32 = $or$cond30 & $46;
    if (!($or$cond32)) {
     $$0 = 0;
     break;
    }
   }
   $47 = HEAP32[$14>>2]|0;
   $$0 = $47;
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($0|0)==($7|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($0)) + 8|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($11)) + 20|0);
  $13 = HEAP32[$12>>2]|0;
  FUNCTION_TABLE_viiiiii[$13 & 31]($10,$1,$2,$3,$4,$5);
 }
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$037$off039 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $not$ = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = ($0|0)==($6|0);
 do {
  if ($7) {
   $8 = ((($1)) + 4|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==($2|0);
   if ($10) {
    $11 = ((($1)) + 28|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($12|0)==(1);
    if (!($13)) {
     HEAP32[$11>>2] = $3;
    }
   }
  } else {
   $14 = HEAP32[$1>>2]|0;
   $15 = ($0|0)==($14|0);
   if (!($15)) {
    $49 = ((($0)) + 8|0);
    $50 = HEAP32[$49>>2]|0;
    $51 = HEAP32[$50>>2]|0;
    $52 = ((($51)) + 24|0);
    $53 = HEAP32[$52>>2]|0;
    FUNCTION_TABLE_viiiii[$53 & 31]($50,$1,$2,$3,$4);
    break;
   }
   $16 = ((($1)) + 16|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = ($17|0)==($2|0);
   if (!($18)) {
    $19 = ((($1)) + 20|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($20|0)==($2|0);
    if (!($21)) {
     $24 = ((($1)) + 32|0);
     HEAP32[$24>>2] = $3;
     $25 = ((($1)) + 44|0);
     $26 = HEAP32[$25>>2]|0;
     $27 = ($26|0)==(4);
     if ($27) {
      break;
     }
     $28 = ((($1)) + 52|0);
     HEAP8[$28>>0] = 0;
     $29 = ((($1)) + 53|0);
     HEAP8[$29>>0] = 0;
     $30 = ((($0)) + 8|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = HEAP32[$31>>2]|0;
     $33 = ((($32)) + 20|0);
     $34 = HEAP32[$33>>2]|0;
     FUNCTION_TABLE_viiiiii[$34 & 31]($31,$1,$2,$2,1,$4);
     $35 = HEAP8[$29>>0]|0;
     $36 = ($35<<24>>24)==(0);
     if ($36) {
      $$037$off039 = 0;
      label = 13;
     } else {
      $37 = HEAP8[$28>>0]|0;
      $not$ = ($37<<24>>24)==(0);
      if ($not$) {
       $$037$off039 = 1;
       label = 13;
      } else {
       label = 17;
      }
     }
     do {
      if ((label|0) == 13) {
       HEAP32[$19>>2] = $2;
       $38 = ((($1)) + 40|0);
       $39 = HEAP32[$38>>2]|0;
       $40 = (($39) + 1)|0;
       HEAP32[$38>>2] = $40;
       $41 = ((($1)) + 36|0);
       $42 = HEAP32[$41>>2]|0;
       $43 = ($42|0)==(1);
       if ($43) {
        $44 = ((($1)) + 24|0);
        $45 = HEAP32[$44>>2]|0;
        $46 = ($45|0)==(2);
        if ($46) {
         $47 = ((($1)) + 54|0);
         HEAP8[$47>>0] = 1;
         if ($$037$off039) {
          label = 17;
          break;
         } else {
          $48 = 4;
          break;
         }
        }
       }
       if ($$037$off039) {
        label = 17;
       } else {
        $48 = 4;
       }
      }
     } while(0);
     if ((label|0) == 17) {
      $48 = 3;
     }
     HEAP32[$25>>2] = $48;
     break;
    }
   }
   $22 = ($3|0)==(1);
   if ($22) {
    $23 = ((($1)) + 32|0);
    HEAP32[$23>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($0|0)==($5|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 } else {
  $7 = ((($0)) + 8|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = HEAP32[$8>>2]|0;
  $10 = ((($9)) + 28|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_viiii[$11 & 63]($8,$1,$2,$3);
 }
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var $0 = 0, $1 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_key_create((10432|0),(60|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  STACKTOP = sp;return;
 } else {
  _abort_message(3481,$vararg_buffer);
  // unreachable;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 _free($0);
 $1 = HEAP32[2608]|0;
 $2 = (_pthread_setspecific(($1|0),(0|0))|0);
 $3 = ($2|0)==(0);
 if ($3) {
  STACKTOP = sp;return;
 } else {
  _abort_message(3531,$vararg_buffer);
  // unreachable;
 }
}
function __ZSt9terminatev() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __THREW__ = 0;
 $0 = (invoke_i(61)|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if ($2) {
  $20 = ___cxa_find_matching_catch_3(0|0)|0;
  $21 = tempRet0;
  ___clang_call_terminate($20);
  // unreachable;
 }
 $3 = ($0|0)==(0|0);
 if (!($3)) {
  $4 = HEAP32[$0>>2]|0;
  $5 = ($4|0)==(0|0);
  if (!($5)) {
   $6 = ((($4)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if ($16) {
    $17 = ((($4)) + 12|0);
    $18 = HEAP32[$17>>2]|0;
    __ZSt11__terminatePFvvE($18);
    // unreachable;
   }
  }
 }
 $19 = (__ZSt13get_terminatev()|0);
 __ZSt11__terminatePFvvE($19);
 // unreachable;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 __THREW__ = 0;
 invoke_v($0|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if (!($2)) {
  __THREW__ = 0;
  invoke_vii(62,(3584|0),($vararg_buffer|0));
  $3 = __THREW__; __THREW__ = 0;
 }
 $4 = ___cxa_find_matching_catch_3(0|0)|0;
 $5 = tempRet0;
 (___cxa_begin_catch(($4|0))|0);
 __THREW__ = 0;
 invoke_vii(62,(3624|0),($vararg_buffer1|0));
 $6 = __THREW__; __THREW__ = 0;
 $7 = ___cxa_find_matching_catch_3(0|0)|0;
 $8 = tempRet0;
 __THREW__ = 0;
 invoke_v(63);
 $9 = __THREW__; __THREW__ = 0;
 $10 = $9&1;
 if ($10) {
  $11 = ___cxa_find_matching_catch_3(0|0)|0;
  $12 = tempRet0;
  ___clang_call_terminate($11);
  // unreachable;
 } else {
  ___clang_call_terminate($7);
  // unreachable;
 }
}
function __ZSt13get_terminatev() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[124]|0;HEAP32[124] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function __ZNSt9bad_allocD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9bad_allocD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZdlPv($0);
 return;
}
function __ZNKSt9bad_alloc4whatEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3674|0);
}
function __ZNSt9exceptionD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt11logic_errorD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (612);
 $1 = ((($0)) + 4|0);
 __ZN12_GLOBAL__N_114__libcpp_nmstrD2Ev($1);
 return;
}
function __ZNSt11logic_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNKSt11logic_error4whatEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 4|0);
 $2 = HEAP32[$1>>2]|0;
 return ($2|0);
}
function __ZN12_GLOBAL__N_114__libcpp_nmstrD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + -4|0);
 $3 = HEAP32[$2>>2]|0;HEAP32[$2>>2] = (($3+-1)|0);
 $4 = (($3) + -1)|0;
 $5 = ($4|0)<(0);
 if ($5) {
  $6 = HEAP32[$0>>2]|0;
  $7 = ((($6)) + -12|0);
  __ZdlPv($7);
 }
 return;
}
function __ZNSt12length_errorD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt11logic_errorD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNSt9bad_allocC2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (592);
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[2609]|0;HEAP32[2609] = (($0+0)|0);
 $1 = $0;
 return ($1|0);
}
function ___cxa_can_catch($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $4;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 16|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (FUNCTION_TABLE_iiii[$7 & 63]($0,$1,$3)|0);
 $9 = $8&1;
 if ($8) {
  $10 = HEAP32[$3>>2]|0;
  HEAP32[$2>>2] = $10;
 }
 STACKTOP = sp;return ($9|0);
}
function ___cxa_is_pointer_type($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $4 = 0;
 } else {
  $2 = (___dynamic_cast($0,32,136,0)|0);
  $phitmp = ($2|0)!=(0|0);
  $4 = $phitmp;
 }
 $3 = $4&1;
 return ($3|0);
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var stop = 0, value4 = 0, stop4 = 0, unaligned = 0;
    stop = (ptr + num)|0;
    if ((num|0) >= 20) {
      // This is unaligned, but quite large, so work hard to get to aligned settings
      value = value & 0xff;
      unaligned = ptr & 3;
      value4 = value | (value << 8) | (value << 16) | (value << 24);
      stop4 = stop & ~3;
      if (unaligned) {
        unaligned = (ptr + 4 - unaligned)|0;
        while ((ptr|0) < (unaligned|0)) { // no need to check for stop, since we have large num
          HEAP8[((ptr)>>0)]=value;
          ptr = (ptr+1)|0;
        }
      }
      while ((ptr|0) < (stop4|0)) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    while ((ptr|0) < (stop|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (ptr-num)|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if ((num|0) >= 4096) return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    ret = dest|0;
    if ((dest&3) == (src&3)) {
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      while ((num|0) >= 4) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
        num = (num-4)|0;
      }
    }
    while ((num|0) > 0) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
      num = (num-1)|0;
    }
    return ret|0;
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function _memmove(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if (((src|0) < (dest|0)) & ((dest|0) < ((src + num)|0))) {
      // Unlikely case: Copy backwards in a safe manner
      ret = dest;
      src = (src + num)|0;
      dest = (dest + num)|0;
      while ((num|0) > 0) {
        dest = (dest - 1)|0;
        src = (src - 1)|0;
        num = (num - 1)|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      }
      dest = ret;
    } else {
      _memcpy(dest, src, num) | 0;
    }
    return dest | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        ___setErrNo(12);
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        return -1;
      }
    }
    return oldDynamicTop|0;
}
function _pthread_self() {
    return 0;
}

  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&63](a1|0,a2|0,a3|0)|0;
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_i(index) {
  index = index|0;
  
  return FUNCTION_TABLE_i[index&63]()|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&63](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&63](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&63](a1|0)|0;
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&63](a1|0,a2|0,a3|0);
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&63]();
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&31](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&63](a1|0,a2|0)|0;
}


function dynCall_id(index,a1) {
  index = index|0;
  a1=+a1;
  return FUNCTION_TABLE_id[index&63](+a1)|0;
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&63](a1|0,a2|0,a3|0,a4|0);
}

function b0(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(0);return 0;
}
function b1(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(1);
}
function b2() {
 ; nullFunc_i(2);return 0;
}
function b3(p0) {
 p0 = p0|0; nullFunc_vi(3);
}
function b4(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(4);
}
function b5(p0) {
 p0 = p0|0; nullFunc_ii(5);return 0;
}
function b6(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_viii(6);
}
function ___cxa_throw__wrapper(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; ___cxa_throw(p0|0,p1|0,p2|0);
}
function b7() {
 ; nullFunc_v(7);
}
function ___cxa_end_catch__wrapper() {
 ; ___cxa_end_catch();
}
function b8(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(8);
}
function b9(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(9);return 0;
}
function b10(p0) {
 p0 = +p0; nullFunc_id(10);return 0;
}
function b11(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(11);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,b0,___stdout_write,___stdio_seek,___stdio_write,_sn_write,b0,b0,b0,b0,b0,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEPKcj,b0,b0,_sprintf,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0];
var FUNCTION_TABLE_viiiii = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1];
var FUNCTION_TABLE_i = [b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,___cxa_get_globals_fast,b2,b2];
var FUNCTION_TABLE_vi = [b3,b3,b3,b3,b3,b3,b3,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b3,b3,b3,b3,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b3,b3,b3,__ZNSt9bad_allocD2Ev,__ZNSt9bad_allocD0Ev,b3,__ZNSt11logic_errorD2Ev,__ZNSt11logic_errorD0Ev,b3,__ZNSt12length_errorD0Ev,b3,b3,b3
,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEED2Ev,__ZNSt3__25dequeINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE9pop_frontEv,b3,__ZNSt3__25dequeIiNS_9allocatorIiEEE9pop_frontEv,b3,b3,b3,b3,__ZNSt3__25dequeINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEED2Ev,__ZNSt3__25dequeIiNS_9allocatorIiEEED2Ev,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEED2Ev,b3,b3,b3,b3,__ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEED2Ev,b3,_cleanup_207,b3,b3,b3
,b3,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,b3,b3,b3];
var FUNCTION_TABLE_vii = [b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,__ZNSt3__25dequeINS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEENS4_IS6_EEE10push_frontERKS6_,b4,__ZNSt3__25dequeIiNS_9allocatorIiEEE10push_frontERKi,b4,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEC2ERKS5_,__ZNSt3__29to_stringEi,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZNSt11logic_errorC2EPKc,b4,__ZNSt3__218__libcpp_refstringC2EPKc
,b4,b4,b4,_abort_message,b4];
var FUNCTION_TABLE_ii = [b5,___stdio_close,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZNKSt9bad_alloc4whatEv,b5,b5,__ZNKSt11logic_error4whatEv,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZNSt3__211char_traitsIcE6lengthEPKc,b5,b5,b5,b5,b5,b5,b5,b5,__Znwj,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5];
var FUNCTION_TABLE_viii = [b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZNSt3__2plIcNS_11char_traitsIcEENS_9allocatorIcEEEENS_12basic_stringIT_T0_T1_EERKS9_PKS6_,__ZNSt3__2plIcNS_11char_traitsIcEENS_9allocatorIcEEEENS_12basic_stringIT_T0_T1_EERKS9_SB_,b6
,b6,b6,b6,b6,b6,__ZNSt3__2plIcNS_11char_traitsIcEENS_9allocatorIcEEEENS_12basic_stringIT_T0_T1_EEPKS6_RKS9_,b6,b6,b6,b6,b6,b6,b6,b6,b6,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcj,b6,__Z15print_formattedPiS_,__ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEE18__construct_at_endINS_13move_iteratorIPS7_EEEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeESG_SG_,b6,___cxa_throw__wrapper,b6,b6,__ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEE18__construct_at_endINS_13move_iteratorIPS1_EEEENS_9enable_ifIXsr21__is_forward_iteratorIT_EE5valueEvE4typeESB_SB_,b6,b6,b6,b6,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6resizeEjc,b6
,b6,b6,b6,b6,b6];
var FUNCTION_TABLE_v = [b7,b7,b7,b7,b7,b7,__ZL25default_terminate_handlerv,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7
,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b7,b7,b7,___cxa_end_catch__wrapper];
var FUNCTION_TABLE_viiiiii = [b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b8,b8,b8,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8];
var FUNCTION_TABLE_iii = [b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEaSERKS5_
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6appendEPKc,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9];
var FUNCTION_TABLE_id = [b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZL13__DOUBLE_BITSd,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10];
var FUNCTION_TABLE_viiii = [b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b11,b11,b11,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZNSt3__212basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEE6__initEPKcjj,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZNSt3__214__split_bufferIPNS_12basic_stringIcNS_11char_traitsIcEENS_9allocatorIcEEEERNS4_IS7_EEEC2EjjS9_,b11,b11,__ZNSt3__214__split_bufferIPiRNS_9allocatorIS1_EEEC2EjjS4_,b11,b11,b11,b11
,b11,b11,b11,b11,b11];

  return { _llvm_cttz_i32: _llvm_cttz_i32, ___cxa_can_catch: ___cxa_can_catch, _free: _free, ___udivmoddi4: ___udivmoddi4, ___cxa_is_pointer_type: ___cxa_is_pointer_type, _i64Add: _i64Add, _memmove: _memmove, _pthread_self: _pthread_self, _i64Subtract: _i64Subtract, _memset: _memset, _malloc: _malloc, _memcpy: _memcpy, ___udivdi3: ___udivdi3, _sbrk: _sbrk, _bitshift64Lshr: _bitshift64Lshr, _fflush: _fflush, _solve_wgyn: _solve_wgyn, ___uremdi3: ___uremdi3, ___errno_location: ___errno_location, _bitshift64Shl: _bitshift64Shl, runPostSets: runPostSets, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_iiii: dynCall_iiii, dynCall_viiiii: dynCall_viiiii, dynCall_i: dynCall_i, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_ii: dynCall_ii, dynCall_viii: dynCall_viii, dynCall_v: dynCall_v, dynCall_viiiiii: dynCall_viiiiii, dynCall_iii: dynCall_iii, dynCall_id: dynCall_id, dynCall_viiii: dynCall_viiii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____uremdi3.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__sbrk.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____cxa_can_catch.apply(null, arguments);
};

var real__solve_wgyn = asm["_solve_wgyn"]; asm["_solve_wgyn"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__solve_wgyn.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real____udivmoddi4 = asm["___udivmoddi4"]; asm["___udivmoddi4"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivmoddi4.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____cxa_is_pointer_type.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Add.apply(null, arguments);
};

var real__memmove = asm["_memmove"]; asm["_memmove"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__memmove.apply(null, arguments);
};

var real__pthread_self = asm["_pthread_self"]; asm["_pthread_self"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__pthread_self.apply(null, arguments);
};

var real__llvm_cttz_i32 = asm["_llvm_cttz_i32"]; asm["_llvm_cttz_i32"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__llvm_cttz_i32.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Lshr.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____udivdi3.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Subtract.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Shl.apply(null, arguments);
};
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var _solve_wgyn = Module["_solve_wgyn"] = asm["_solve_wgyn"];
var _free = Module["_free"] = asm["_free"];
var ___udivmoddi4 = Module["___udivmoddi4"] = asm["___udivmoddi4"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _pthread_self = Module["_pthread_self"] = asm["_pthread_self"];
var _llvm_cttz_i32 = Module["_llvm_cttz_i32"] = asm["_llvm_cttz_i32"];
var _memset = Module["_memset"] = asm["_memset"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_id = Module["dynCall_id"] = asm["dynCall_id"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
;

Runtime.stackAlloc = asm['stackAlloc'];
Runtime.stackSave = asm['stackSave'];
Runtime.stackRestore = asm['stackRestore'];
Runtime.establishStackSpace = asm['establishStackSpace'];

Runtime.setTempRet0 = asm['setTempRet0'];
Runtime.getTempRet0 = asm['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===





function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
      throw e;
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
    quit(status);
  }
  // if we reach here, we must throw an exception to halt the current execution
  throw new ExitStatus(status);
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



