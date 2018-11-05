type Call = {
  args: Array<any>;
  value: any;
  instance: any;
  isThrow: boolean;
  isConstructor: boolean;
};

type MockOptions = {
  accessKey?: string | symbol;
};

type Proxifiable = object | Function;

class Mock {
  options: MockOptions;
  calls: Array<Call>;
  proxifiedCache: WeakMap<Proxifiable, Proxifiable>;
  getterMocks: { [k: string]: Mock };
  setterMocks: { [k: string]: Mock };

  static proxify(target, options = {}) {
    const mock = new Mock(options);
    return new Proxy(target, mock.handler());
  }

  constructor(options: MockOptions = {}) {
    const defaultOptions = {
      accessKey: 'mock',
    };

    this.options = {
      ...defaultOptions,
      ...options,
    };

    this.calls = [];
    this.proxifiedCache = new WeakMap();
    this.getterMocks = {};
    this.setterMocks = {};
  }

  getImplementation(defult?: Function) {
    return defult;
  }

  getProxified(target) {
    if (this.proxifiedCache.has(target)) {
      return this.proxifiedCache.get(target);
    }

    const proxified = Mock.proxify(target, this.options);
    this.proxifiedCache.set(target, proxified);

    return proxified;
  }

  getter(prop) {
    if (Object.prototype.hasOwnProperty.call(this.getterMocks, prop)) {
      return this.getterMocks[prop];
    }

    return (this.getterMocks[prop] = new Mock());
  }

  setter(prop) {
    if (Object.prototype.hasOwnProperty.call(this.setterMocks, prop)) {
      return this.setterMocks[prop];
    }

    return (this.setterMocks[prop] = new Mock());
  }

  handler() {
    const mock = this;

    return {
      get(target, propName, receiver) {
        if (propName === mock.options.accessKey) {
          return mock;
        }

        const getterMock = mock.getter(propName);
        const implementation = getterMock.getImplementation();

        const call: Call = {
          args: [],
          instance: receiver,
          value: undefined,
          isThrow: false,
          isConstructor: false,
        };

        try {
          let property = implementation
            ? Reflect.apply(implementation, receiver, [])
            : Reflect.get(target, propName, receiver);

          if (typeof property === 'object' || typeof property === 'function') {
            property = mock.getProxified(property);
          }

          return (call.value = property);
        } catch (err) {
          call.isThrow = true;
          call.value = err;

          throw err;
        } finally {
          getterMock.calls.push(call);
        }
      },

      set(target, propName, value, receiver) {
        if (propName === mock.options.accessKey) {
          return false;
        }

        const setterMock = mock.setter(propName);
        const implementation = setterMock.getImplementation();

        const call: Call = {
          args: [value],
          instance: receiver,
          value: undefined,
          isThrow: false,
          isConstructor: false,
        };

        try {
          if (implementation === undefined) {
            return Reflect.set(target, propName, value, receiver);
          }

          call.value = Reflect.apply(implementation, receiver, [value]);
          return true;
        } catch (err) {
          call.isThrow = true;
          call.value = err;

          throw err;
        } finally {
          setterMock.calls.push(call);
        }
      },

      construct(target, args, newTarget) {
        const implementation = mock.getImplementation(target);

        const call: Call = {
          args,
          instance: undefined,
          value: undefined,
          isThrow: false,
          isConstructor: true,
        };

        try {
          const instance = mock.getProxified(
            Reflect.construct(implementation, args, newTarget)
          );

          return (call.instance = instance);
        } catch (err) {
          call.isThrow = true;
          call.value = err;

          throw err;
        } finally {
          mock.calls.push(call);
        }
      },

      apply(target, thisArg, args) {
        const implementation = mock.getImplementation(target);

        const call: Call = {
          args,
          instance: thisArg,
          value: undefined,
          isThrow: false,
          isConstructor: false,
        };

        try {
          let result = Reflect.apply(<Function>implementation, thisArg, args);

          if (typeof result === 'object' || typeof result === 'function') {
            result = this.proxify(result);
          }

          return (call.value = result);
        } catch (err) {
          call.isThrow = true;
          call.value = err;

          throw err;
        } finally {
          mock.calls.push(call);
        }
      },
    };
  }
}

export default Mock;