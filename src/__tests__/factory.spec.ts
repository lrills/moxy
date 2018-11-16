import factory from '../factory';
import Mock from '../mock';

it('returns a moxied target', () => {
  const target = { foo: 'bar' };
  const moxied = factory()(target);

  expect(moxied).toEqual({ foo: 'bar' });
  expect(moxied).not.toBe(target);
  expect(moxied.mock).toBeInstanceOf(Mock);
});

it('returns a moxied empty function if no target provided', () => {
  const moxied = factory()();

  expect(typeof moxied).toBe('function');
  expect(moxied.length).toBe(0);
  expect(moxied()).toBe(undefined);
  expect(moxied.mock).toBeInstanceOf(Mock);
});

it('use default options provided to create Mock', () => {
  const options = {
    accessKey: 'myMock',
    middlewares: [handler => handler],
    proxifyReturnValue: false,
    proxifyNewInstance: false,
    proxifyProperties: false,
    includeProperties: ['foo'],
    excludeProperties: ['bar'],
    recordGetter: true,
    recordSetter: true,
  };

  const moxied = factory()({}, options);

  expect(moxied.myMock.options).toEqual(options);
});

it('use create time options provided to create Mock', () => {
  const options = {
    accessKey: 'myMock',
    middlewares: [handler => handler],
    proxifyReturnValue: false,
    proxifyNewInstance: false,
    proxifyProperties: false,
    includeProperties: ['foo'],
    excludeProperties: ['bar'],
    recordGetter: true,
    recordSetter: true,
  };

  const moxied = factory()({}, options);

  expect(moxied.myMock.options).toEqual(options);
});

it('extends the default options with create time options', () => {
  const defaultOptions = {
    accessKey: 'myMock',
    middlewares: [handler => handler],
    proxifyReturnValue: false,
    proxifyNewInstance: false,
    includeProperties: ['foo'],
    recordGetter: true,
  };

  const createTimeOptions = {
    accessKey: 'myOwnMock',
    proxifyNewInstance: true,
    proxifyProperties: true,
    excludeProperties: ['bar'],
    recordSetter: true,
  };

  const moxied = factory(defaultOptions)({}, createTimeOptions);

  expect(moxied.myOwnMock.options).toEqual({
    accessKey: 'myOwnMock',
    middlewares: defaultOptions.middlewares,
    proxifyReturnValue: false,
    proxifyNewInstance: true,
    proxifyProperties: true,
    includeProperties: ['foo'],
    excludeProperties: ['bar'],
    recordGetter: true,
    recordSetter: true,
  });
});

it('concat the array options', () => {
  const defaultOptions = {
    middlewares: [handler => handler],
    includeProperties: ['foo1', 'foo2'],
    excludeProperties: ['bar1'],
  };

  const createTimeOptions = {
    middlewares: [handler => handler],
    includeProperties: ['foo3'],
    excludeProperties: ['bar2', 'bar3'],
  };

  const moxied = factory(defaultOptions)({}, createTimeOptions);

  expect(moxied.mock.options).toEqual({
    accessKey: 'mock',
    middlewares: [
      defaultOptions.middlewares[0],
      createTimeOptions.middlewares[0],
    ],
    proxifyReturnValue: true,
    proxifyNewInstance: true,
    proxifyProperties: true,
    includeProperties: ['foo1', 'foo2', 'foo3'],
    excludeProperties: ['bar1', 'bar2', 'bar3'],
    recordGetter: false,
    recordSetter: false,
  });
});