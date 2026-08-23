/* eslint-disable @typescript-eslint/no-unused-vars */
declare module 'react-native/Libraries/Utilities/codegenNativeComponent' {
  import type { HostComponent } from 'react-native';
  export default function codegenNativeComponent<Props extends {}>(
    name: string,
    options?: { interfaceOnly?: boolean }
  ): HostComponent<Props>;
}

declare module 'react-native/Libraries/Types/CodegenTypes' {
  import type { SyntheticEvent } from 'react-native';

  export type Double = number;
  export type Float = number;
  export type Int32 = number;
  export type UnsafeDirectEventHandler<T, _P = unknown> = (
    event: SyntheticEvent<T>
  ) => void;
  export type BubblingEventHandler<T, _P = unknown> = (
    event: SyntheticEvent<T>
  ) => void;
  export type DirectEventHandler<T, _P = unknown> = (
    event: SyntheticEvent<T>
  ) => void;
  export type WithDefault<T, _V extends T> = T;
  export type Booleanish = boolean;
}
