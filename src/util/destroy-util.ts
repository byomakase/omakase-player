import {Destroyable} from '../types';

export class DestroyUtil {

  public static destroy(...destroyables: Destroyable[]) {
    destroyables.forEach(destroyable => {
      if (destroyable) {
        destroyable.destroy();
      }
    })
  }

}
