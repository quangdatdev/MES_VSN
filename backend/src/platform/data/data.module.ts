import { Global, Module } from '@nestjs/common';
import { ResourceRegistry } from './resource-registry';

@Global()
@Module({ providers: [ResourceRegistry], exports: [ResourceRegistry] })
export class DataModule {}
