'use strict';

/*!
 * Booking.js
 * Version: 1.5.1
 * http://booking.timekit.io
 *
 * Copyright 2015 Timekit, Inc.
 * Timekit Booking.js is freely distributable under the MIT license.
 *
 */

// External depenencies
var $               = require('jquery');
window.fullcalendar = require('fullcalendar');
var moment          = window.moment = require('moment');
var timekit         = require('timekit-sdk');

// Internal dependencies
var utils         = require('./utils');
var defaultConfig = require('./defaults');

// Main library
function TimekitBooking() {

  // Library config
  var config = {};

  // DOM nodes
  var rootTarget;
  var calendarTarget;
  var bookingPageTarget;

  // Inject style dependencies
  var includeStyles = function() {
    require('../node_modules/fullcalendar/dist/fullcalendar.css');
    require('./styles/fullcalendar.scss');
    require('./styles/utils.scss');
    require('./styles/main.scss');
  };

  // Make sure DOM element is ready and clean it
  var prepareDOM = function() {

    rootTarget = $(config.targetEl);
    if (rootTarget.length === 0) {
      throw new Error('TimekitBooking - No target DOM element was found (' + config.targetEl + ')');
    }
    rootTarget.addClass('bookingjs');
    rootTarget.children(':not(script)').remove();

  };

  // Setup the Timekit SDK with correct credentials
  var timekitSetup = function() {

    var args = {};
    $.extend(true, args, config.timekitConfig);

    timekit.configure(args);
    timekit.setUser(config.email, config.apiToken);

  };

  // Fetch availabile time through Timekit SDK
  var timekitFindTime = function() {

    var args = { emails: [config.email] };
    $.extend(args, config.timekitFindTime);

    utils.doCallback('findTimeStarted', config, args);

    timekit.findTime(args)
    .then(function(response){

      utils.doCallback('findTimeSuccessful', config, response);

      // Go to first event if enabled
      if(config.goToFirstEvent && response.data.length > 0) {
        var firstEventStart = response.data[0].start;
        var firstEventStartHour = moment(firstEventStart).format('H');
        goToDate(firstEventStart);
        scrollToTime(firstEventStartHour);
      }

      // Render available timeslots in FullCalendar
      renderCalendarEvents(response.data);

    }).catch(function(response){
      utils.doCallback('findTimeFailed', config, response);
      throw new Error('TimekitBooking - An error with Timekit FindTime occured, context: ' + response);
    });

  };

  // Tells FullCalendar to go to a specifc date
  var goToDate = function(date) {

    calendarTarget.fullCalendar('gotoDate', date);

  };

  // Scrolls fullcalendar to the specified hour
  var scrollToTime = function(time) {

    // Only proceed for agendaWeek view
    if (calendarTarget.fullCalendar('getView').name !== 'agendaWeek'){
      return;
    }

    // Get height of each hour row
    var hours = calendarTarget.find('.fc-slats .fc-minor');
    var hourHeight = $(hours[0]).height() * 2;

    // If minTime is set in fullCalendar config, subtract that from the scollTo calculationn
    var minTimeHeight = 0;
    if (config.fullCalendar.minTime) {
      var minTime = moment(config.fullCalendar.minTime, 'HH:mm:ss').format('H');
      minTimeHeight = hourHeight * minTime;
    }

    // Calculate scrolling location and container sizes
    var scrollTo = (hourHeight * time) - minTimeHeight;
    var scrollable = calendarTarget.find('.fc-scroller');
    var scrollableHeight = scrollable.height();
    var scrollableScrollTop = scrollable.scrollTop();
    var maximumHeight = scrollable.find('.fc-time-grid').height();

    // Only perform the scroll if the scrollTo is outside the current visible boundary
    if (scrollTo > scrollableScrollTop && scrollTo < scrollableScrollTop + scrollableHeight) {
      return;
    }

    // If scrollTo point is past the maximum height, then scroll to maximum possible while still animating
    if (scrollTo > maximumHeight - scrollableHeight) {
      scrollTo = maximumHeight - scrollableHeight;
    }

    // Perform the scrollTo animation
    scrollable.animate({scrollTop: scrollTo});

  };

  // Calculate and display timezone helper
  var renderTimezoneHelper = function() {

    var localTzOffset = (new Date()).getTimezoneOffset()/60*-1;
    var timezoneIcon = require('!svg-inline!./assets/timezone-icon.svg');

    var template = require('./templates/timezone-helper.html');

    var timezoneHelperTarget = $(template.render({
      timezoneIcon: timezoneIcon,
      loading: true
    }));

    rootTarget.addClass('has-timezonehelper');
    rootTarget.append(timezoneHelperTarget);

    var args = {
      email: config.email
    };

    utils.doCallback('getUserTimezoneStarted', config, args);

    timekit.getUserTimezone(args).then(function(response){

      utils.doCallback('getUserTimezoneSuccesful', config, response);

      var hostTzOffset = response.data.utc_offset;
      var tzOffsetDiff = Math.abs(localTzOffset - hostTzOffset);

      var template = require('./templates/timezone-helper.html');
      var newTimezoneHelperTarget = $(template.render({
        timezoneIcon: timezoneIcon,
        timezoneDifference: (tzOffsetDiff === 0 ? false : true),
        timezoneOffset: tzOffsetDiff,
        timezoneDirection: (tzOffsetDiff > 0 ? 'ahead' : 'behind'),
        hostName: config.name
      }));

      timezoneHelperTarget.replaceWith(newTimezoneHelperTarget);

    }).catch(function(response){
      utils.doCallback('getUserTimezoneFailed', config, response);
      throw new Error('TimekitBooking - An error with Timekit getUserTimezone occured, context: ' + response);
    });

  };

  // Setup and render FullCalendar
  var initializeCalendar = function() {

    var sizing = decideCalendarSize();

    var args = {
      defaultView: sizing.view,
      height: sizing.height,
      eventClick: showBookingPage,
      windowResize: function() {
        var sizing = decideCalendarSize();
        calendarTarget.fullCalendar('changeView', sizing.view);
        calendarTarget.fullCalendar('option', 'height', sizing.height);
      }
    };

    $.extend(true, args, config.fullCalendar);

    calendarTarget = $('<div class="bookingjs-calendar empty-calendar">');
    rootTarget.append(calendarTarget);

    calendarTarget.fullCalendar(args);
    rootTarget.addClass('show');

    utils.doCallback('fullCalendarInitialized', config);

  };

  // Fires when window is resized and calendar must adhere
  var decideCalendarSize = function() {

    var view = 'agendaWeek';
    var height = 420;
    var rootWidth = rootTarget.width();

    if (rootWidth < 480) {
      view = 'basicDay';
      height = 335;
      rootTarget.addClass('is-small');
    } else {
      rootTarget.removeClass('is-small');
    }

    if (config.bookingFields.comment.enabled) {  height += 84; }
    if (config.bookingFields.phone.enabled) {    height += 48; }
    if (config.bookingFields.voip.enabled) {     height += 48; }
    if (config.bookingFields.location.enabled) { height += 48; }

    return {
      height: height,
      view: view
    };

  };

  // Render the supplied calendar events in FullCalendar
  var renderCalendarEvents = function(eventData) {

    calendarTarget.fullCalendar('addEventSource', {
      events: eventData
    });

    calendarTarget.removeClass('empty-calendar');

  };

  // Render the avatar image
  var renderAvatarImage = function() {

    var template = require('./templates/user-avatar.html');
    var avatarTarget = $(template.render({
      image: config.avatar
    }));

    rootTarget.addClass('has-avatar');
    rootTarget.append(avatarTarget);

  };

  // Render the avatar image
  var renderDisplayName = function() {

    var template = require('./templates/user-displayname.html');
    var displayNameTarget = $(template.render({
      name: config.name
    }));

    rootTarget.addClass('has-displayname');
    rootTarget.append(displayNameTarget);

  };

  // Event handler when a timeslot is clicked in FullCalendar
  var showBookingPage = function(eventData) {

    utils.doCallback('showBookingPage', config, eventData);

    var fieldsTemplate = require('./templates/booking-fields.html');
    var template = require('./templates/booking-page.html');

    var dateFormat = config.localization.bookingDateFormat || moment.localeData().longDateFormat('LL');
    var timeFormat = config.localization.bookingTimeFormat || moment.localeData().longDateFormat('LT');

    bookingPageTarget = $(template.render({
      chosenDate:           moment(eventData.start).format(dateFormat),
      chosenTime:           moment(eventData.start).format(timeFormat) + ' - ' + moment(eventData.end).format(timeFormat),
      start:                moment(eventData.start).format(),
      end:                  moment(eventData.end).format(),
      closeIcon:            require('!svg-inline!./assets/close-icon.svg'),
      checkmarkIcon:        require('!svg-inline!./assets/checkmark-icon.svg'),
      loadingIcon:          require('!svg-inline!./assets/loading-spinner.svg'),
      errorIcon:            require('!svg-inline!./assets/error-icon.svg'),
      submitText:           'Book it',
      successMessageTitle:  'Thanks!',
      successMessagePart1:  'An invitation has been sent to:',
      successMessagePart2:  'Accept the invitation to confirm the booking.',
      fields:               config.bookingFields
    }, {
      formFields: fieldsTemplate
    }));

    bookingPageTarget.children('.bookingjs-bookpage-close').click(function(e) {
      e.preventDefault();
      hideBookingPage();
    });

    var form = bookingPageTarget.children('.bookingjs-form');

    form.submit(function(e) {
      submitBookingForm(this, e);
    });

    // Show powered by Timekit message
    if (config.showCredits) {
      renderPoweredByMessage(bookingPageTarget);
    }

    $(document).on('keyup', function(e) {
      // escape key maps to keycode `27`
      if (e.keyCode === 27) { hideBookingPage(); }
    });

    rootTarget.append(bookingPageTarget);

    setTimeout(function(){
      bookingPageTarget.addClass('show');
    }, 100);

  };

  // Remove the booking page DOM node
  var hideBookingPage = function() {

    utils.doCallback('closeBookingPage', config);

    bookingPageTarget.removeClass('show');

    setTimeout(function(){
      bookingPageTarget.remove();
    }, 200);

    $(document).off('keyup');

  };

  // Event handler on form submit
  var submitBookingForm = function(form, e) {

    e.preventDefault();

    var formElement = $(form);

    // Abort if form is submitting, have submitted or does not validate
    if(formElement.hasClass('loading') || formElement.hasClass('success') || formElement.hasClass('error') || !e.target.checkValidity()) {
      var submitButton = formElement.find('.bookingjs-form-button');
      submitButton.addClass('button-shake');
      setTimeout(function() {
        submitButton.removeClass('button-shake');
      }, 500);
      return;
    }

    var values = {};
    $.each(formElement.serializeArray(), function(i, field) {
        values[field.name] = field.value;
    });

    formElement.addClass('loading');

    utils.doCallback('submitBookingForm', config, values);

    // Call create event endpoint
    timekitCreateEvent(values).then(function(response){

      utils.doCallback('createEventSuccessful', config, response);

      formElement.find('.booked-email').html(values.email);
      formElement.removeClass('loading').addClass('success');

    }).catch(function(response){

      utils.doCallback('createEventFailed', config, response);

      var submitButton = formElement.find('.bookingjs-form-button');
      submitButton.addClass('button-shake');
      setTimeout(function() {
        submitButton.removeClass('button-shake');
      }, 500);

      formElement.removeClass('loading').addClass('error');
      setTimeout(function() {
        formElement.removeClass('error');
      }, 2000);

      throw new Error('TimekitBooking - An error with Timekit createEvent occured, context: ' + response);
    });

  };

  // Create new event through Timekit SDK
  var timekitCreateEvent = function(data) {

    var args = {
      start: data.start,
      end: data.end,
      what: config.name + ' x ' + data.name,
      where: 'TBD',
      description: '',
      calendar_id: config.calendar,
      participants: [config.email, data.email]
    };

    if (config.bookingFields.location.enabled) { args.where = data.location; }
    if (config.bookingFields.phone.enabled) {    args.description += config.bookingFields.phone.placeholder + ': ' + data.phone + '\n'; }
    if (config.bookingFields.voip.enabled) {     args.description += config.bookingFields.voip.placeholder + ': ' + data.voip + '\n'; }
    if (config.bookingFields.comment.enabled) {  args.description += config.bookingFields.comment.placeholder + ': ' + data.comment + '\n'; }

    $.extend(true, args, config.timekitCreateEvent);

    utils.doCallback('createEventStarted', config, args);

    return timekit.createEvent(args);

  };

  // Render the powered by Timekit message
  var renderPoweredByMessage = function(pageTarget) {

    var template = require('./templates/poweredby.html');
    var timekitIcon = require('!svg-inline!./assets/timekit-icon.svg');
    var poweredTarget = $(template.render({
      timekitIcon: timekitIcon
    }));

    pageTarget.append(poweredTarget);

  };

  // Set configs and defaults
  var setConfig = function(suppliedConfig) {

    // Check whether a config is supplied
    if(suppliedConfig === undefined || typeof suppliedConfig !== 'object' || $.isEmptyObject(suppliedConfig)) {
      if (window.timekitBookingConfig !== undefined) {
        suppliedConfig = window.timekitBookingConfig;
      } else {
        throw new Error('TimekitBooking - No configuration was supplied or found. Please supply a config object upon library initialization');
      }
    }

    // Extend the default config with supplied settings
    var newConfig = $.extend(true, {}, defaultConfig.primary, suppliedConfig);

    // Apply any presets if applicable (supplied config have presedence over preset)
    var presetsConfig = {};
    if(newConfig.localization.timeDateFormat === '24h-dmy-mon') {
      presetsConfig = defaultConfig.presets.timeDateFormat24hdmymon;
    }
    if(newConfig.localization.timeDateFormat === '12h-mdy-sun') {
      presetsConfig = defaultConfig.presets.timeDateFormat12hmdysun;
    }

    // Extend the config with the presets
    var finalConfig = $.extend(true, {}, presetsConfig, newConfig);

    // Check for required settings
    if(!finalConfig.email || !finalConfig.apiToken || !finalConfig.calendar) {
      throw new Error('TimekitBooking - A required config setting was missing ("email", "apiToken" or "calendar")');
    }

    // Set new config to instance config
    config = finalConfig;

    return config;

  };

  // Get library config
  var getConfig = function() {

    return config;

  };

  // Render method
  var render = function() {

    // Set rootTarget to the target element and clean before child nodes before continuing
    prepareDOM();

    // Setup Timekit SDK config
    timekitSetup();

    // Initialize FullCalendar
    initializeCalendar();

    // Get availability through Timekit SDK
    timekitFindTime();

    // Show timezone helper if enabled
    if (config.localization.showTimezoneHelper) {
      renderTimezoneHelper();
    }

    // Show image avatar if set
    if (config.avatar) {
      renderAvatarImage();
    }

    // Print out display name
    if (config.name) {
      renderDisplayName();
    }

    utils.doCallback('renderCompleted', config);

    return this;

  };

  // Initilization method
  var init = function(suppliedConfig) {

    // Handle config and defaults
    setConfig(suppliedConfig);

    // Include library styles if enabled
    if (config.includeStyles) {
      includeStyles();
    }

    return render();

  };

  var destroy = function() {

    prepareDOM();
    config = {};
    return this;

  };

  // The fullCalendar object for advanced puppeting
  var fullCalendar = function() {

    if (calendarTarget.fullCalendar === undefined) { return undefined; }
    return calendarTarget.fullCalendar.apply(calendarTarget, arguments);

  };

  // Expose methods
  return {
    setConfig: setConfig,
    getConfig: getConfig,
    render:    render,
    init:      init,
    destroy:   destroy,
    fullCalendar: fullCalendar
  };

}

// Autoload if config is available on window, else export function
if (window && window.timekitBookingConfig && window.timekitBookingConfig.autoload !== false) {
  $(window).load(function(){
    var instance = new TimekitBooking();
    instance.init(window.timekitBookingConfig);
    module.exports = instance;
  });
} else {
  module.exports = TimekitBooking;
}
