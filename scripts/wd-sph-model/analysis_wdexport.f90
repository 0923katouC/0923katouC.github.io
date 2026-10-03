! Read-only export adapter for the WD visualization experiment.
! Native Phantom data: Cartesian-like Boyer-Lindquist, G=M_BH=c=1.
module analysis
 use iso_fortran_env, only:real64
 implicit none
 character(len=20), parameter, public :: analysistype='wdexport'
 public :: do_analysis
contains
 subroutine do_analysis(dumpfile,numfile,xyzh,vxyzu,pmass,npart,time,iunit)
  use part, only:metrics,metricderivs,rhoh,poten
  use metric, only:a,mass1
  use metric_tools, only:init_metric
  use utils_gr, only:get_u0,rho2dens
  use eos, only:gamma
  use infile_utils, only:open_db_from_file,inopts,read_inopt,close_db
  character(len=*), intent(in) :: dumpfile
  integer,intent(in) :: numfile,npart,iunit
  real,intent(in) :: xyzh(:,:),vxyzu(:,:),pmass,time
  integer :: i,outunit,ierr,dbunit,underscore
  character(len=256) :: inputfile
  type(inopts),allocatable :: db(:)
  real :: rho,dens,ut,pressure
  real(real64) :: row(13),hdr(4)
  ! phantomanalysis does not load Kerr spin from .in. Load the actual run's
  ! parameters before metric-dependent density conversion.
  a=.86; mass1=1.
  underscore=index(dumpfile,'_',back=.true.)
  inputfile=dumpfile(:underscore-1)//'.in'
  call open_db_from_file(db,trim(inputfile),dbunit,ierr)
  call read_inopt(a,'a',db,ierr)
  call read_inopt(mass1,'mass1',db,ierr)
  call close_db(db)
  call init_metric(npart,xyzh,metrics,metricderivs)
  open(newunit=outunit,file=trim(dumpfile)//'.raw',access='stream',form='unformatted',status='replace')
  hdr=[real(time,real64),real(npart,real64),real(pmass,real64),real(a,real64)]
  write(outunit) hdr
  do i=1,npart
   rho=rhoh(xyzh(4,i),pmass)
   call rho2dens(dens,rho,metrics(:,:,:,i),vxyzu(1:3,i))
   call get_u0(metrics(:,:,1,i),vxyzu(1:3,i),ut,ierr)
   pressure=(gamma-1.)*dens*vxyzu(4,i)
   row=[real(xyzh(:,i),real64),real(vxyzu(:,i),real64),&
        real(rho,real64),real(dens,real64),real(ut,real64),real(pressure,real64),real(poten(i),real64)]
   write(outunit) row
  enddo
  close(outunit)
  print *, 'Exported ',trim(dumpfile),time,npart
 end subroutine do_analysis
end module analysis
