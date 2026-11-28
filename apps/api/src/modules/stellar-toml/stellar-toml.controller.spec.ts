import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { StellarTomlController } from './stellar-toml.controller';
import { StellarTomlService, ValidationIssue } from './stellar-toml.service';
import {
  StellarTomlFormatDto,
  StellarTomlParseDto,
  StellarTomlValidateDto,
} from './dto/stellar-toml-parse.dto';

describe('StellarTomlController', () => {
  let controller: StellarTomlController;
  let service: {
    parse: jest.Mock;
    format: jest.Mock;
    validate: jest.Mock;
    getTemplate: jest.Mock;
  };

  beforeEach(() => {
    service = {
      parse: jest.fn(),
      format: jest.fn(),
      validate: jest.fn(),
      getTemplate: jest.fn(),
    };
    controller = new StellarTomlController(service as unknown as StellarTomlService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('parse', () => {
    it('delegates the content and strict flag to the service', async () => {
      const dto: StellarTomlParseDto = { content: 'VERSION="2.0.0"', strict: false };
      const expected = { parsed: { VERSION: '2.0.0' }, issues: [], isValid: true };
      service.parse.mockResolvedValue(expected);

      await expect(controller.parse(dto)).resolves.toBe(expected);
      expect(service.parse).toHaveBeenCalledWith(dto.content, dto.strict);
    });

    it('propagates the structured bad request returned for malformed TOML', async () => {
      const response = {
        message: 'Invalid TOML syntax',
        error: 'Unexpected token',
        details: { line: 1, column: 1, message: 'Unexpected token' },
      };
      service.parse.mockRejectedValue(new BadRequestException(response));

      await expect(controller.parse({ content: 'VERSION = ' })).rejects.toMatchObject({
        response,
      });
      expect(service.parse).toHaveBeenCalledWith('VERSION = ', undefined);
    });
  });

  describe('format', () => {
    it('delegates the content and indentation options and wraps the result', async () => {
      const dto: StellarTomlFormatDto = {
        content: 'VERSION="2.0.0"',
        indent: 'tabs',
        indentSize: 4,
      };
      service.format.mockResolvedValue('VERSION = "2.0.0"');

      await expect(controller.format(dto)).resolves.toEqual({ formatted: 'VERSION = "2.0.0"' });
      expect(service.format).toHaveBeenCalledWith(dto.content, dto.indent, dto.indentSize);
    });

    it('propagates the bad request returned for invalid TOML content', async () => {
      service.format.mockRejectedValue(
        new BadRequestException('Invalid TOML content - cannot format'),
      );

      await expect(controller.format({ content: 'INVALID [ TOML' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validate', () => {
    it('delegates the domain TOML content with the validation level and network', async () => {
      const dto: StellarTomlValidateDto = {
        content: 'VERSION="2.0.0"\nNETWORK_PASSPHRASE="Test SDF Network ; September 2015"',
        level: 'strict',
        network: 'testnet',
      };
      const expected = { isValid: true, issues: [], summary: { errors: 0, warnings: 0, infos: 0 } };
      service.validate.mockResolvedValue(expected);

      await expect(controller.validate(dto)).resolves.toBe(expected);
      expect(service.validate).toHaveBeenCalledWith(dto.content, dto.level, dto.network);
    });

    it('returns the validation issues reported for a domain configuration', async () => {
      const issues: ValidationIssue[] = [
        {
          level: 'error',
          field: 'FEDERATION_SERVER',
          message: 'FEDERATION_SERVER must be a valid HTTPS URL',
        },
        {
          level: 'warning',
          field: 'DOCUMENTATION.ORG_NAME',
          message: 'Organization name is recommended',
        },
      ];
      service.validate.mockResolvedValue({
        isValid: false,
        issues,
        summary: { errors: 1, warnings: 1, infos: 0 },
      });

      const result = await controller.validate({
        content: 'VERSION="2.0.0"\nFEDERATION_SERVER="http://api.example.com/federation"',
        level: 'strict',
        network: 'mainnet',
      });

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(issues);
      expect(result.summary).toEqual({ errors: 1, warnings: 1, infos: 0 });
    });

    it('returns the parse error response when the domain TOML cannot be parsed', async () => {
      const parseFailure = {
        isValid: false,
        issues: [{ level: 'error' as const, message: 'TOML parsing failed: Unexpected token' }],
        summary: { errors: 1, warnings: 0, infos: 0 },
      };
      service.validate.mockResolvedValue(parseFailure);

      const result = await controller.validate({ content: 'INVALID TOML [[[' });

      expect(result).toEqual(parseFailure);
      expect(service.validate).toHaveBeenCalledWith('INVALID TOML [[[', undefined, undefined);
    });
  });

  describe('getTemplate', () => {
    it('requests the minimal template by default', () => {
      service.getTemplate.mockReturnValue('VERSION="2.0.0"');

      expect(controller.getTemplate()).toEqual({ template: 'VERSION="2.0.0"' });
      expect(service.getTemplate).toHaveBeenCalledWith('minimal');
    });

    it('passes the requested template type through', () => {
      service.getTemplate.mockReturnValue('[[VALIDATORS]]');

      expect(controller.getTemplate('validator')).toEqual({ template: '[[VALIDATORS]]' });
      expect(service.getTemplate).toHaveBeenCalledWith('validator');
    });
  });

  describe('domain validation and TOML error responses', () => {
    let realController: StellarTomlController;

    beforeEach(() => {
      realController = new StellarTomlController(new StellarTomlService());
    });

    it('rejects a domain passphrase that does not match the requested network', async () => {
      const result = await realController.validate({
        content:
          'VERSION="2.0.0"\nNETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"',
        level: 'strict',
        network: 'testnet',
      });

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'error',
            field: 'NETWORK_PASSPHRASE',
            message: expect.stringContaining("doesn't match testnet"),
          }),
        ]),
      );
    });

    it('reports invalid domain endpoints in the validation response', async () => {
      const result = await realController.validate({
        content: 'VERSION="2.0.0"\nFEDERATION_SERVER="http://api.example.com/federation"',
        level: 'basic',
        network: 'testnet',
      });

      expect(result.isValid).toBe(false);
      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            level: 'error',
            field: 'FEDERATION_SERVER',
            message: expect.stringContaining('HTTPS URL'),
          }),
        ]),
      );
    });

    it('returns a parse failure response for malformed domain TOML', async () => {
      const result = await realController.validate({ content: 'INVALID TOML [[[' });

      expect(result.isValid).toBe(false);
      expect(result.summary).toEqual({ errors: 1, warnings: 0, infos: 0 });
      expect(result.issues[0].message).toContain('TOML parsing failed');
    });

    it('surfaces a structured bad request for malformed TOML on parse', async () => {
      await expect(realController.parse({ content: 'INVALID TOML [[[' })).rejects.toMatchObject({
        response: { message: 'Invalid TOML syntax' },
      });
    });

    it('surfaces a structured bad request for malformed TOML on format', async () => {
      await expect(realController.format({ content: 'INVALID [ TOML' })).rejects.toMatchObject({
        response: { message: 'Invalid TOML content - cannot format' },
      });
    });
  });

  describe('request DTO validation', () => {
    it('accepts parse requests with content and an optional strict flag', async () => {
      const dto = plainToInstance(StellarTomlParseDto, {
        content: 'VERSION="2.0.0"',
        strict: true,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('rejects parse requests without content', async () => {
      const dto = plainToInstance(StellarTomlParseDto, { strict: true });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'content')).toBe(true);
    });

    it('rejects a non-boolean strict flag', async () => {
      const dto = plainToInstance(StellarTomlParseDto, {
        content: 'VERSION="2.0.0"',
        strict: 'yes',
      });

      const errors = await validate(dto);
      expect(
        errors.some(
          (error) => error.property === 'strict' && error.constraints?.isBoolean !== undefined,
        ),
      ).toBe(true);
    });

    it('accepts format requests with indentation options', async () => {
      const dto = plainToInstance(StellarTomlFormatDto, {
        content: 'VERSION="2.0.0"',
        indent: 'spaces',
        indentSize: 4,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('rejects format requests without content', async () => {
      const dto = plainToInstance(StellarTomlFormatDto, { indent: 'tabs' });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'content')).toBe(true);
    });

    it('accepts validate requests with a level and network', async () => {
      const dto = plainToInstance(StellarTomlValidateDto, {
        content: 'VERSION="2.0.0"',
        level: 'strict',
        network: 'mainnet',
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    });

    it('rejects validate requests without content', async () => {
      const dto = plainToInstance(StellarTomlValidateDto, { level: 'basic' });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'content')).toBe(true);
    });
  });
});
