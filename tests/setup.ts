import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-node-16';

configure({ adapter: new Adapter() });

// Global test timeout
jest.setTimeout(10000);
