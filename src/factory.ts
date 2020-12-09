import Mock from './mock';
import { concatOptions } from './utils';
import { MockOptionsInput, Proxifiable } from './type';

function empty(): void {}

const moxyFactory = (defaultOptions: MockOptionsInput = {}) => <
  T extends Proxifiable = any
>(
  target?: T,
  options: MockOptionsInput = {}
): T & { mock: Mock } => {
  const mock = new Mock(concatOptions(defaultOptions, options));

  if (target === undefined) {
    return mock.proxify(empty as any);
  }

  return mock.proxify(target);
};

export default moxyFactory;
