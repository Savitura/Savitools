import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser, AuthUser } from './current-user.decorator';

describe('CurrentUser Decorator', () => {
  it('should extract the user object from the request', () => {
    const mockUser: AuthUser = {
      id: 'usr-111',
      email: 'decorator@example.com',
    };

    const mockRequest = {
      user: mockUser,
    };

    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    // Retrieve factory function from param decorator metadata
    const factory = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'testMethod');
    const key = Object.keys(factory)[0];
    const factoryFn = factory[key].factory;

    const result = factoryFn(null, mockContext);

    expect(result).toEqual(mockUser);
  });
});

class TestController {
  public testMethod(@CurrentUser() _user: AuthUser) {}
}
