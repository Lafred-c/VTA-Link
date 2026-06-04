export { AuthLayout } from './components/AuthLayout';
export { ProtectedRoute } from './components/ProtectedRoute';
export { LoginForm } from './components/LoginForm';
export { SignUpForm } from './components/SignUpForm';
export { ForgotPasswordForm } from './components/ForgotPasswordForm';
export { ResetPasswordForm } from './components/ResetPasswordForm';
export { ProfileView } from './components/ProfileView';
export { authDb } from './services/authDb';

// Types, Constants, Utils
export type { UserRole, PasswordStrength } from './auth.types';
export { ROLE_ROUTES, AUTH_FEATURES } from './auth.constants';
export { fadeUp, floatVariant, pulseRing, computePasswordStrength } from './auth.utils';

