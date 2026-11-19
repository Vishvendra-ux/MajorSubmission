import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CheckCircle2,
  FileSearch,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
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
  const [selectedDemoRole, setSelectedDemoRole] = useState<string | null>(null);

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

  const fillDemoAccount = (roleName: string, email: string, pass: string) => {
    setSelectedDemoRole(roleName);
    setValue('email', email, { shouldValidate: true });
    setValue('password', pass, { shouldValidate: true });
  };

  return (
    <div className="landing-hero relative isolate min-h-[calc(100vh-144px)] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div
        aria-hidden="true"
        className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[36rem] opacity-60"
      />
      <div className="relative mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        {/* Left Informational Showcase Panel */}
        <div className="hidden space-y-6 lg:block">
          <Badge variant="blue" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Zero-Trust Enterprise Knowledge Console
          </Badge>
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Every answer verified against your{' '}
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-300">
              authorised documents.
            </span>
          </h2>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            Sign in to access your organisation’s multi-format knowledge base, semantic search
            engine, grounded AI assistant, and role-scoped governance dashboards.
          </p>

          <div className="space-y-3 pt-2">
            {[
              {
                icon: ShieldCheck,
                title: 'Pre-Retrieval RBAC Enforcement',
                desc: 'Admin, Manager, and Employee permissions are verified before vector search runs.',
              },
              {
                icon: FileSearch,
                title: 'Clickable Page, Slide & Sheet Citations',
                desc: 'Inspect exact cited passages with confidence scores and source location labels.',
              },
              {
                icon: CheckCircle2,
                title: 'Explicit Refusal When Evidence Is Missing',
                desc: 'Prevents hallucinated policies by refusing unsupported questions.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3.5 rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 shadow-2xs backdrop-blur dark:border-slate-800 dark:bg-slate-900/70"
                >
                  <div className="icon-tile h-10 w-10">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Authentication Card */}
        <Card className="preview-shadow mx-auto w-full max-w-md space-y-6 border-white/80 bg-white/95 p-6 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 sm:p-8">
          <div className="space-y-1.5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">
              <Lock className="h-5 w-5" />
            </div>
            <h1 className="pt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Sign in to SUMIND-IQ
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Access your organisation’s permission-scoped AI knowledge base
            </p>
          </div>

          {serverError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
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
              <span className="inline-flex items-center gap-1 text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Argon2id + JWT Secured
              </span>
              <Link
                to="/forgot-password"
                className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" variant="primary" className="w-full" isLoading={isSubmitting}>
              Sign In to Workspace
            </Button>
          </form>

          {/* Explicitly Labelled Demonstration Accounts */}
          <div className="space-y-2.5 border-t border-slate-200/80 pt-4 dark:border-slate-800">
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
                onClick={() => fillDemoAccount('admin', 'admin@sumind-iq.demo', 'Admin@12345')}
                className={`flex flex-col items-center rounded-xl border p-2.5 text-xs transition-all ${
                  selectedDemoRole === 'admin'
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 dark:bg-blue-950/50'
                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:bg-blue-950/30'
                }`}
              >
                <ShieldCheck className="mb-1 h-4 w-4 text-blue-600" />
                <span className="font-semibold">Admin</span>
                <span className="text-[10px] text-slate-400">Full Scope</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  fillDemoAccount('manager', 'manager@sumind-iq.demo', 'Manager@12345')
                }
                className={`flex flex-col items-center rounded-xl border p-2.5 text-xs transition-all ${
                  selectedDemoRole === 'manager'
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 dark:bg-blue-950/50'
                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:bg-blue-950/30'
                }`}
              >
                <UserCheck className="mb-1 h-4 w-4 text-emerald-600" />
                <span className="font-semibold">Manager</span>
                <span className="text-[10px] text-slate-400">Team Scope</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  fillDemoAccount('employee', 'employee@sumind-iq.demo', 'Employee@12345')
                }
                className={`flex flex-col items-center rounded-xl border p-2.5 text-xs transition-all ${
                  selectedDemoRole === 'employee'
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 dark:bg-blue-950/50'
                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:bg-blue-950/30'
                }`}
              >
                <Mail className="mb-1 h-4 w-4 text-indigo-600" />
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
    <div className="landing-hero relative isolate min-h-[calc(100vh-144px)] px-4 py-12 sm:px-6 lg:px-8">
      <div
        aria-hidden="true"
        className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[36rem] opacity-60"
      />
      <div className="relative mx-auto max-w-lg">
        <Card className="preview-shadow space-y-6 border-white/80 bg-white/95 p-6 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 sm:p-8">
          <div className="space-y-1.5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <h1 className="pt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              Create Your SUMIND-IQ Account
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Specify a new Organisation name to become its Admin, or leave blank to join the
              default workspace as an Employee.
            </p>
          </div>

          {serverError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    <div className="landing-hero min-h-[calc(100vh-144px)] px-4 py-16">
      <div className="mx-auto max-w-md">
        <Card className="preview-shadow space-y-5 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="icon-tile">
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
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                {submittedMessage}
              </div>
              {devResetToken && (
                <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs dark:border-blue-800 dark:bg-blue-950/50">
                  <span className="font-bold text-blue-800 dark:text-blue-300">
                    Safe Development Mode (console_dev email provider):
                  </span>
                  <p className="break-all rounded border bg-white p-2 font-mono dark:bg-slate-900">
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
    <div className="landing-hero min-h-[calc(100vh-144px)] px-4 py-16">
      <div className="mx-auto max-w-md">
        <Card className="preview-shadow space-y-5 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="icon-tile">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Set a New Password</h1>
              <p className="text-xs text-slate-500">Rotate your Argon2id credential hash</p>
            </div>
          </div>
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
    </div>
  );
}
