// The monitor module originally owned the only pagination DTO in the API. It is
// now the shared CommonModule DTO, re-exported here so existing imports keep
// working while every list endpoint shares one definition.
export { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
