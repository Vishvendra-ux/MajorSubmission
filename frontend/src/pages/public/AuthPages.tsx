import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSearch,
  Fingerprint,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
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
  const [showPassword, setShowPassword] = useState(false);

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
      setServerError(
        err instanceof Error ? err.message : 'Invalid credentials',
      );
    }
  };

  const fillDemoAccount = (role: string, email: string, password: string) => {
    setSelectedDemoRole(role);
    setServerError(null);
    setValue('email', email, { shouldValidate: true });
    setValue('password', password, { shouldValidate: true });
  };

  const demoAccounts = [
    {
      role: 'admin',
      label: 'Admin',
      note: 'Full scope',
      email: 'admin@sumind-iq.demo',
      password: 'Admin@12345',
      icon: ShieldCheck,
      color: 'text-blue-600 dark:text-blue-400',
    },
    {
      role: 'manager',
      label: 'Manager',
      note: 'Team scope',
      email: 'manager@sumind-iq.demo',
      password: 'Manager@12345',
      icon: Briefcase,
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      role: 'employee',
      label: 'Employee',
      note: 'Standard',
      email: 'employee@sumind-iq.demo',
      password: 'Employee@12345',
      icon: UserRound,
      color: 'text-indigo-600 dark:text-indigo-400',
    },
  ];

  const features = [
    {
      icon: ShieldCheck,
      title: 'Access-aware search',
      desc: 'Results follow your workspace permissions.',
    },
    {
      icon: FileSearch,
      title: 'Source citations',
      desc: 'Open the page, slide, or section behind an answer.',
    },
    {
      icon: CheckCircle2,
      title: 'Evidence checks',
      desc: 'Unsupported questions can be clearly refused.',
    },
    {
      icon: Fingerprint,
      title: 'Role-scoped tools',
      desc: 'Each workspace role gets its own capabilities.',
    },
  ];

  return (
    <div className="landing-hero relative isolate flex min-h-[calc(100vh-144px)] items-center overflow-hidden px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div
        aria-hidden="true"
        className="landing-grid pointer-events-none absolute inset-0 opacity-55"
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="hidden lg:block">
          <div className="max-w-xl">
            <Badge
              variant="blue"
              className="gap-2 rounded-full border-blue-200/80 bg-white/80 px-3.5 py-1.5 text-[11px] shadow-sm dark:border-blue-900 dark:bg-slate-900/80"
            >
              <Sparkles className="h-3.5 w-3.5" /> A clearer way to use team
              knowledge
            </Badge>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-[-0.04em] text-slate-950 dark:text-white xl:text-5xl">
              Find the answer.{' '}
              <span className="bg-gradient-to-r from-blue-700 via-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-blue-300 dark:via-indigo-300 dark:to-violet-300">
                See the source.
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-slate-600 dark:text-slate-300">
              Sign in to search your organisation’s documents and work with
              answers connected to their source material.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {features.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/75"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 ring-1 ring-blue-100 dark:from-blue-950/70 dark:to-indigo-950/70 dark:text-blue-300 dark:ring-blue-900/70">
                      <Icon className="h-[17px] w-[17px] stroke-[1.8]" />
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-slate-900 dark:text-white">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                        {item.desc}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-8 flex items-center gap-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-emerald-600 dark:border-slate-800 dark:bg-slate-900">
                <Lock className="h-4 w-4" />
              </span>
              Your access is checked for every workspace request.
            </div>
          </div>
        </div>

        <Card className="preview-shadow relative mx-auto w-full max-w-[440px] overflow-hidden border-white/80 bg-white/95 p-6 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 sm:p-8">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500"
          />
          <div className="space-y-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900">
              <Lock className="h-[18px] w-[18px]" />
            </span>
            <h2 className="pt-1 text-[26px] font-extrabold tracking-[-0.035em] text-slate-950 dark:text-white">
              Welcome back
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sign in to continue to your knowledge workspace.
            </p>
          </div>

          {serverError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
            >
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
              <span>{serverError}</span>
            </div>
          )}

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-6 space-y-4"
            noValidate
          >
            <div className="relative">
              <Mail
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-[39px] h-[17px] w-[17px] text-slate-400"
              />
              <Input
                label="Work email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                placeholder="you@organisation.com"
                error={errors.email?.message}
                className="h-12 rounded-xl pl-11"
                {...register('email', {
                  onChange: () => {
                    setSelectedDemoRole(null);
                    setServerError(null);
                  },
                })}
              />
            </div>
            <div className="relative">
              <KeyRound
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-[39px] h-[17px] w-[17px] text-slate-400"
              />
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                error={errors.password?.message}
                className="h-12 rounded-xl pl-11 pr-12"
                {...register('password', {
                  onChange: () => {
                    setSelectedDemoRole(null);
                    setServerError(null);
                  },
                })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-2.5 top-[33px] inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                {showPassword ? (
                  <EyeOff className="h-[17px] w-[17px]" />
                ) : (
                  <Eye className="h-[17px] w-[17px]" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 pt-0.5 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />{' '}
                Secure sign-in
              </span>
              <Link
                to="/forgot-password"
                className="font-semibold text-blue-700 transition hover:text-indigo-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                Forgot password?
              </Link>
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="mt-1 w-full shadow-lg shadow-blue-700/20"
              isLoading={isSubmitting}
            >
              Sign in to workspace <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Try a demo account
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Prefills seeded demo credentials
                </p>
              </div>
              <Badge variant="amber" className="shrink-0">
                Demo data
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {demoAccounts.map((demo) => {
                const Icon = demo.icon;
                const selected = selectedDemoRole === demo.role;
                return (
                  <button
                    key={demo.role}
                    type="button"
                    onClick={() =>
                      fillDemoAccount(demo.role, demo.email, demo.password)
                    }
                    aria-pressed={selected}
                    className={`flex min-h-[76px] flex-col items-center justify-center rounded-xl border px-1.5 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${selected ? 'border-blue-500 bg-white shadow-sm ring-2 ring-blue-500/15 dark:bg-slate-900' : 'border-slate-200 bg-white/70 hover:border-blue-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-blue-700'}`}
                  >
                    <Icon className={`mb-1 h-4 w-4 ${demo.color}`} />
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                      {demo.label}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {demo.note}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
            New to SUMIND-IQ?{' '}
            <Link
              to="/register"
              className="font-bold text-blue-700 hover:underline dark:text-blue-400"
            >
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
              <p className="text-xs text-slate-500">Rotate your bcrypt credential hash</p>
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
