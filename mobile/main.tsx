// Mobile entry: install the Android implementation of window.api first, then load the same app
// the desktop build uses.
import { installMobileApi } from '../src/renderer/src/mobile/api'

void installMobileApi().then(() => import('../src/renderer/src/main'))
