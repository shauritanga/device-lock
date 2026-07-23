import { mount } from '@/shared/bootstrap';
import { APP_LABELS } from '@/shared/config';
import ClientApp from './App';

mount(ClientApp, APP_LABELS.client);
