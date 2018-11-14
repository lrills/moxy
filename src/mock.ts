import Call from './call';

// eslint-disable-next-line typescript/no-use-before-define
type PropMockMapping = { [k: string /* | number | symbol */]: Mock };
// FIXME: wait Microsoft/TypeScript#26797 to support 👆
export type Proxifiable = object | Function;

type ProxyMiddleware = (
  handler: ProxyHandler<Proxifiable>,
  mock: Mock
) => ProxyHandler<Proxifiable>;

export type MockOptions = {
  accessKey: string | symbol;
  middlewares?: Array<ProxyMiddleware>;
  proxifyReturnValue: boolean;
  proxifyNewInstance: boolean;
  proxifyProperties: boolean;
  includeProperties?: Array<string | symbol>;
  excludeProperties?: Array<string | symbol>;
};

export type MockOptionsInput = { [O in keyof MockOptions]?: MockOptions[O] };

const clearAllPropOfMocks = (mapping: PropMockMapping) => {
  Object.keys(mapping).forEach(k => {
    mapping[k].clear();
  });
};

const isProxifiable = target =>
  (typeof target === 'object' && target !== null) ||
  typeof target === 'function';

const isFunctionProp = (source, propName) =>
  typeof source === 'function' &&
  (propName === 'prototype' || propName === 'name' || propName === 'length');

export default class Mock {
  options: MockOptions;

  _calls: Array<Call>;
  _targetSourceMapping: WeakMap<Proxifiable, Proxifiable>;
  _proxifiedValueCache: WeakMap<Proxifiable, Proxifiable>;
  getterMocks: PropMockMapping;
  setterMocks: PropMockMapping;
  defaultImplementation: Function;
  impletationQueue: Array<Function>;

  constructor(options: MockOptionsInput = {}) {
    const defaultOptions = {
      accessKey: 'mock',
      middlewares: null,
      proxifyReturnValue: true,
      proxifyNewInstance: true,
      proxifyProperties: true,
      includeProperties: null,
      excludeProperties: null,
    };

    this.options = {
      ...defaultOptions,
      ...options,
    };

    this.reset();
    this._targetSourceMapping = new WeakMap();
  }

  get calls() {
    // NOTE: returns a copy of _calls to prevent it keeps growing while deeply
    //       comparing the calls which might traverse through the moxied object
    return [...this._calls];
  }

  proxify(source: Proxifiable): any {
    if (!isProxifiable(source)) {
      throw new TypeError(
        'Cannot create proxy with a non-object as target or handler'
      );
    }

    const target = this._registerSource(source);
    return new Proxy(target, this.handle());
  }

  // FIXME: wait Microsoft/TypeScript#26797 to support👇
  getter(prop: any /* number | string | symbol */) {
    if (Object.prototype.hasOwnProperty.call(this.getterMocks, prop)) {
      return this.getterMocks[prop];
    }

    return (this.getterMocks[prop] = new Mock());
  }

  // FIXME: wait Microsoft/TypeScript#26797 to support👇
  setter(prop: any /* number | string | symbol */) {
    if (Object.prototype.hasOwnProperty.call(this.setterMocks, prop)) {
      return this.setterMocks[prop];
    }

    return (this.setterMocks[prop] = new Mock());
  }

  clear() {
    this._initCalls();

    this._proxifiedValueCache = new WeakMap();
    clearAllPropOfMocks(this.getterMocks);
    clearAllPropOfMocks(this.setterMocks);
  }

  reset() {
    this._initCalls();

    this._proxifiedValueCache = new WeakMap();
    this.getterMocks = {};
    this.setterMocks = {};
    this.impletationQueue = [];
    this.defaultImplementation = undefined;
  }

  fake(implementation: Function) {
    this.defaultImplementation = implementation;
  }

  fakeOnce(implementation: Function) {
    this.impletationQueue.push(implementation);
  }

  fakeReturnValue(val: any) {
    this.fake(() => val);
  }

  fakeReturnValueOnce(val: any) {
    this.fakeOnce(() => val);
  }

  handle(): ProxyHandler<Proxifiable> {
    const baseHandler: ProxyHandler<Proxifiable> = {
      get: (target, propName, receiver) => {
        if (propName === this.options.accessKey) {
          return this;
        }

        const source = this._getSource(target);

        const getterMock = this.getter(propName);
        const implementation = getterMock._getImplementation();

        const call = new Call({ instance: receiver });

        const shouldReturnNativeProp = isFunctionProp(source, propName);
        try {
          let property = implementation
            ? Reflect.apply(implementation, receiver, [])
            : Reflect.get(
                !shouldReturnNativeProp && propName in target ? target : source,
                propName
              );

          if (
            this._shouldProxifyProp(propName) &&
            !shouldReturnNativeProp &&
            isProxifiable(property)
          ) {
            property = this._getProxified(property);
          }

          return (call.result = property);
        } catch (err) {
          call.isThrow = true;
          call.result = err;

          throw err;
        } finally {
          getterMock._calls.push(call);
        }
      },

      set: (target, propName, value, receiver) => {
        if (propName === this.options.accessKey) {
          return false;
        }

        const setterMock = this.setter(propName);
        const implementation = setterMock._getImplementation();

        const call = new Call({ args: [value], instance: receiver });

        try {
          if (implementation === undefined) {
            return Reflect.set(target, propName, value);
          }

          call.result = Reflect.apply(implementation, receiver, [value]);
          return true;
        } catch (err) {
          call.isThrow = true;
          call.result = err;

          throw err;
        } finally {
          setterMock._calls.push(call);
        }
      },

      construct: this._mapTargetToSource((source, args, newTarget) => {
        const implementation = this._getImplementation(source);

        const call = new Call({ args, isConstructor: true });

        try {
          let instance = Reflect.construct(implementation, args, newTarget);

          if (this.options.proxifyNewInstance) {
            instance = this._getProxified(instance);
          }

          return (call.instance = instance);
        } catch (err) {
          call.isThrow = true;
          call.result = err;

          throw err;
        } finally {
          this._calls.push(call);
        }
      }),

      apply: this._mapTargetToSource((source, thisArg, args) => {
        const implementation = this._getImplementation(source);

        const call = new Call({ args, instance: thisArg });

        try {
          let result = Reflect.apply(<Function>implementation, thisArg, args);

          if (this.options.proxifyReturnValue && isProxifiable(result)) {
            result = this._getProxified(result);
          }

          return (call.result = result);
        } catch (err) {
          call.isThrow = true;
          call.result = err;

          throw err;
        } finally {
          this._calls.push(call);
        }
      }),

      getOwnPropertyDescriptor: (target, prop) =>
        Reflect.getOwnPropertyDescriptor(target, prop) ||
        Reflect.getOwnPropertyDescriptor(this._getSource(target), prop),

      getPrototypeOf: target => {
        const source = this._getSource(target);

        return (
          (typeof source === 'object' && Reflect.getPrototypeOf(target)) ||
          Reflect.getPrototypeOf(source)
        );
      },

      has: (target, prop) =>
        Reflect.has(target, prop) || Reflect.has(this._getSource(target), prop),

      ownKeys: target => {
        const source = this._getSource(target);
        return Reflect.ownKeys(target).concat(Reflect.ownKeys(source));
      },
    };

    return this.options.middlewares
      ? this.options.middlewares.reduce(
          (wrappedHandler, wrapper) => wrapper(wrappedHandler, this),
          baseHandler
        )
      : baseHandler;
  }

  _getProxified(target) {
    if (this._proxifiedValueCache.has(target)) {
      return this._proxifiedValueCache.get(target);
    }

    const childMock = new Mock(this.options);

    const proxified = childMock.proxify(target);
    this._proxifiedValueCache.set(target, proxified);

    return proxified;
  }

  _initCalls() {
    // NOTE: to prevent infinity loops caused by _calls growing while deeply comparing mocks
    Object.defineProperties(this, {
      _calls: {
        enumerable: false,
        configurable: true,
        writable: false,
        value: [],
      },
    });
  }

  _shouldProxifyProp(name) {
    const { options } = this;
    if (
      !options.proxifyProperties ||
      (options.excludeProperties && options.excludeProperties.includes(name))
    ) {
      return false;
    }
    return (
      !options.includeProperties || options.includeProperties.includes(name)
    );
  }

  _getImplementation(target?: Function) {
    if (this.impletationQueue.length > 0) {
      return this.impletationQueue.shift();
    }

    if (this.defaultImplementation !== undefined) {
      return this.defaultImplementation;
    }

    return target;
  }

  _registerSource(source: Proxifiable) {
    const target =
      typeof source === 'function' ? function double() {} : Object.create(null);

    this._targetSourceMapping.set(target, source);
    return target;
  }

  _getSource(target) {
    return this._targetSourceMapping.get(target);
  }

  _mapTargetToSource(fn) {
    return (target, ...restArgs) => {
      const source = this._getSource(target);
      return fn(source, ...restArgs);
    };
  }
}
