import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Lock, Mail, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { apiRequest } from '../../services/apiClient';
import { Badge, Button, Card, Input } from '../../components/ui/Primitives';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid work email address'),
  password: z.string().min(1, 'Password is required'),
});
type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);
    try {
      const user = await login(values.email, values.password);
      toast({
        title: `Welcome back, ${user.full_name}`,
        description: `Signed in to ${user.organisation_name} as ${user.role.toUpperCase()}.`,
        variant: 'success',
      });
      navigate('/app/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials';
      setServerError(msg);
    }
  };

  const fillDemoAccount = (email: string, pass: string) => {
    setValue('email', email, { shouldValidate: true });
    setValue('password', pass, { shouldValidate: true });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <Card className="p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1.5">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Sign in to SUMIND-IQ
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Access your organisation’s permission-scoped AI knowledge base
          </p>
        </div>

        {serverError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs font-medium text-rose-700 dark:text-rose-300"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Work Email"
            type="email"
            placeholder="name@organisation.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••••••"
            error={errors.password?.message}
            {...register('password')}
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Argon2id + JWT Secured</span>
            <Link
              to="/forgot-password"
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
            Sign In to Workspace
          </Button>
        </form>

        {/* Explicitly Labelled Demonstration Accounts */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Demonstration Role Accounts [DEMO DATA]
            </span>
            <Badge variant="amber">Evaluation</Badge>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Click a role below to populate seeded demonstration credentials for testing RBAC:
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => fillDemoAccount('admin@sumind-iq.demo', 'Admin@12345')}
              className="flex flex-col items-center rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-xs hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors"
            >
              <ShieldCheck className="h-4 w-4 text-blue-600 mb-1" />
              <span className="font-semibold">Admin</span>
              <span className="text-[10px] text-slate-400">Full Scope</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('manager@sumind-iq.demo', 'Manager@12345')}
              className="flex flex-col items-center rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-xs hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors"
            >
              <UserCheck className="h-4 w-4 text-emerald-600 mb-1" />
              <span className="font-semibold">Manager</span>
              <span className="text-[10px] text-slate-400">Team Scope</span>
            </button>
            <button
              type="button"
              onClick={() => fillDemoAccount('employee@sumind-iq.demo', 'Employee@12345')}
              className="flex flex-col items-center rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-xs hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors"
            >
              <Mail className="h-4 w-4 text-indigo-600 mb-1" />
              <span className="font-semibold">Employee</span>
              <span className="text-[10px] text-slate-400">Standard</span>
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500">
          New to SUMIND-IQ?{' '}
          <Link to="/register" className="font-semibold text-blue-600 hover:underline">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}

const registerSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Enter a valid work email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9!@#$%^&*]/, 'Must contain at least one number or special character'),
  organisation_name: z.string().optional(),
  job_title: z.string().optional(),
  department: z.string().optional(),
});
type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      organisation_name: '',
      job_title: 'Knowledge Engineer',
      department: 'Engineering',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    setServerError(null);
    try {
      const user = await registerUser(values);
      toast({
        title: 'Account Registered Successfully',
        description: `Welcome to ${user.organisation_name} (${user.role.toUpperCase()}).`,
        variant: 'success',
      });
      navigate('/app/dashboard');
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card className="p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Create Your SUMIND-IQ Account
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Specify a new Organisation name to become its Admin, or leave blank to join the default
            workspace as an Employee.
          </p>
        </div>

        {serverError && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs font-medium text-rose-700 dark:text-rose-300"
          >
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Full Name"
            placeholder="Dr. Ananya Verma"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
          <Input
            label="Work Email"
            type="email"
            placeholder="ananya@company.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min 8 chars, uppercase, lowercase & number"
            error={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Organisation Name (Optional — creates new isolated tenant)"
            placeholder="e.g., Horizon Cybernetics Pvt Ltd"
            error={errors.organisation_name?.message}
            {...register('organisation_name')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Job Title"
              placeholder="Knowledge Analyst"
              {...register('job_title')}
            />
            <Input
              label="Department"
              placeholder="Engineering"
              {...register('department')}
            />
          </div>

          <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
            Register & Launch Workspace
          </Button>
        </form>

        <p className="text-center text-xs text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest<{
        message: string;
        dev_mode_reset_token?: string;
      }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSubmittedMessage(res.message);
      if (res.dev_mode_reset_token) {
        setDevResetToken(res.dev_mode_reset_token);
      }
    } catch (err: unknown) {
      setSubmittedMessage(
        err instanceof Error ? err.message : 'Unable to process password reset request.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Reset Your Password</h1>
            <p className="text-xs text-slate-500">
              Enter your registered work email to receive a reset token
            </p>
          </div>
        </div>

        {submittedMessage ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-4 text-xs text-emerald-900 dark:text-emerald-200">
              {submittedMessage}
            </div>
            {devResetToken && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 p-4 space-y-2 text-xs">
                <span className="font-bold text-blue-800 dark:text-blue-300">
                  Safe Development Mode (console_dev email provider):
                </span>
                <p className="font-mono break-all bg-white dark:bg-slate-900 p-2 rounded border">
                  {devResetToken}
                </p>
                <Link
                  to={`/reset-password?token=${encodeURIComponent(devResetToken)}`}
                  className="inline-block font-semibold text-blue-600 hover:underline"
                >
                  Proceed to Reset Password Form →
                </Link>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Registered Email Address"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@sumind-iq.demo"
            />
            <Button type="submit" variant="primary" className="w-full" isLoading={loading}>
              Send Reset Instructions
            </Button>
          </form>
        )}

        <div className="text-center text-xs">
          <Link to="/login" className="font-semibold text-blue-600 hover:underline">
            ← Back to Sign In
          </Link>
        </div>
      </Card>
    </div>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const [token, setToken] = useState(params.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      toast({
        title: 'Password Reset Complete',
        description: 'You can now sign in with your new password.',
        variant: 'success',
      });
      navigate('/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6 sm:p-8 space-y-5">
        <h1 className="text-xl font-bold">Set a New Password</h1>
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Reset Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
          <Input
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 chars, uppercase, lowercase & number"
            required
          />
          <Button type="submit" variant="primary" className="w-full" isLoading={loading}>
            Update Password
          </Button>
        </form>
      </Card>
    </div>
  );
}

